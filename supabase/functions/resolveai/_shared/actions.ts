// =====================================================================
// ResolveAI — deterministic action tools + verification engine
// (Deno only — uses the Enter Cloud client)
//
// Safety model: the LLM never touches these. Actions execute only after
// the four-gate controller passes. Each action records an agent_action
// row, mutates real state, and is independently verified.
// =====================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import type { ActionResult, VerificationResult } from "./engine/types.ts";

export async function nextRefundId(db: SupabaseClient): Promise<string> {
  const { data } = await db
    .from("resolveai_refunds")
    .select("refund_id")
    .order("refund_id", { ascending: false })
    .limit(1);
  const last = data && data.length > 0 ? Number((data[0] as { refund_id: string }).refund_id.slice(3)) : 0;
  return `RF-${String(last + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------
// issue_refund — full validate → gates → record → mutate → verify flow.
// The caller runs the gates; this tool executes only permitted actions.
// ---------------------------------------------------------------------
export async function executeRefund(
  db: SupabaseClient,
  ctx: {
    caseUuid: string;
    caseId: string;
    customerId: string;
    paymentUuid: string;
    amount: number;
    agentKey: string;
  },
): Promise<{ action: ActionResult; verification: VerificationResult }> {
  const { data: payment, error: payErr } = await db
    .from("resolveai_payments")
    .select("*")
    .eq("id", ctx.paymentUuid)
    .maybeSingle();
  if (payErr || !payment) {
    return {
      action: {
        action: "issue_refund",
        status: "failed",
        detail: "Payment record not found",
        output: {},
        error: "payment_not_found",
      },
      verification: {
        overall: "unknown",
        checks: [],
        detail: "Action could not be executed — payment record missing",
      },
    };
  }

  // Simulated external gateway failure (demo Track C / circuit breaker)
  if ((payment as { refund_api_sim_fail?: boolean }).refund_api_sim_fail) {
    return {
      action: {
        action: "issue_refund",
        status: "failed",
        detail: "Payment gateway refund API unavailable (timeout)",
        output: {},
        error: "refund_api_unavailable",
      },
      verification: {
        overall: "failed",
        checks: [
          { name: "refund_created", expected: true, actual: false, pass: false },
        ],
        detail: "Refund API call failed before a refund record was created",
      },
    };
  }

  const refundId = await nextRefundId(db);
  const { error: insErr } = await db.from("resolveai_refunds").insert({
    refund_id: refundId,
    case_id: ctx.caseUuid,
    payment_id: ctx.paymentUuid,
    customer_id: ctx.customerId,
    amount: ctx.amount,
    status: "issued",
    issued_at: new Date().toISOString(),
  });
  if (insErr) {
    return {
      action: {
        action: "issue_refund",
        status: "failed",
        detail: `Refund record creation failed: ${insErr.message}`,
        output: {},
        error: "refund_record_failed",
      },
      verification: { overall: "unknown", checks: [], detail: "Action execution errored" },
    };
  }

  // Mutate payment + order state
  const { error: payUpd } = await db
    .from("resolveai_payments")
    .update({ status: "refunded" })
    .eq("id", ctx.paymentUuid);

  const { data: order } = await db
    .from("resolveai_payments")
    .select("order_id")
    .eq("id", ctx.paymentUuid)
    .maybeSingle();
  if (order && (order as { order_id: string }).order_id) {
    await db
      .from("resolveai_orders")
      .update({ status: "pending" })
      .eq("id", (order as { order_id: string }).order_id);
  }

  // ---------------------------------------------------------------------
  // Independent verification: re-query the rows just written.
  // ---------------------------------------------------------------------
  const { data: refundRow } = await db
    .from("resolveai_refunds")
    .select("*")
    .eq("refund_id", refundId)
    .maybeSingle();
  const { data: payAfter } = await db
    .from("resolveai_payments")
    .select("status, amount")
    .eq("id", ctx.paymentUuid)
    .maybeSingle();

  const checks = [
    {
      name: "refund_record_exists",
      expected: true,
      actual: Boolean(refundRow),
      pass: Boolean(refundRow),
    },
    {
      name: "refund_amount_matches",
      expected: ctx.amount,
      actual: refundRow ? (refundRow as { amount: number }).amount : null,
      pass: refundRow ? Number((refundRow as { amount: number }).amount) === ctx.amount : false,
    },
    {
      name: "payment_status_refunded",
      expected: "refunded",
      actual: payAfter ? (payAfter as { status: string }).status : null,
      pass: payAfter ? (payAfter as { status: string }).status === "refunded" : false,
    },
    {
      name: "refund_timestamp_recorded",
      expected: true,
      actual: refundRow ? Boolean((refundRow as { issued_at?: string }).issued_at) : false,
      pass: refundRow ? Boolean((refundRow as { issued_at?: string }).issued_at) : false,
    },
  ];
  const allPass = checks.every((c) => c.pass);
  const verification: VerificationResult = {
    overall: allPass ? "passed" : "failed",
    checks,
    detail: allPass
      ? `Refund ${refundId} verified — payment marked REFUNDED`
      : "Verification failed — refund record incomplete",
  };

  return {
    action: {
      action: "issue_refund",
      status: verification.overall === "passed" ? "succeeded" : "blocked",
      detail: verification.overall === "passed"
        ? `Refund ${refundId} issued for ₹${ctx.amount}`
        : "Refund issued but verification failed",
      output: { refund_id: refundId, amount: ctx.amount, payment_status: "refunded" },
      error: verification.overall === "passed" ? undefined : "verification_failed",
    },
    verification,
  };
}

// ---------------------------------------------------------------------
// update_ticket — record an internal ticket progress update.
// ---------------------------------------------------------------------
export async function executeUpdateTicket(
  db: SupabaseClient,
  ctx: {
    caseUuid: string;
    customerId: string;
    intent: string;
    note: string;
    agentKey: string;
  },
): Promise<ActionResult> {
  const { data: ticket } = await db
    .from("resolveai_tickets")
    .select("*")
    .eq("customer_id", ctx.customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ticket) {
    await db
      .from("resolveai_tickets")
      .update({ resolution: `${ctx.note} (automated, case ${ctx.caseUuid.slice(0, 8)})` })
      .eq("id", (ticket as { id: string }).id);
  } else {
    await db.from("resolveai_tickets").insert({
      ticket_id: `TCK-${Date.now().toString().slice(-6)}`,
      customer_id: ctx.customerId,
      subject: "Automated case update",
      category: ctx.intent,
      status: "closed",
      resolution: ctx.note,
    });
  }
  return {
    action: "update_ticket",
    status: "succeeded",
    detail: "Ticket updated",
    output: { note: ctx.note },
  };
}

// ---------------------------------------------------------------------
// send_message — send a customer-facing message (stored in conversation)
// ---------------------------------------------------------------------
export async function executeSendMessage(
  db: SupabaseClient,
  ctx: { conversationUuid: string | null; content: string; agentKey: string },
): Promise<ActionResult> {
  if (!ctx.conversationUuid) {
    return {
      action: "send_message",
      status: "failed",
      detail: "No conversation attached to case",
      output: {},
      error: "conversation_missing",
    };
  }
  const { error } = await db.from("resolveai_messages").insert({
    conversation_id: ctx.conversationUuid,
    role: "ai",
    content: ctx.content,
  });
  if (error) {
    return {
      action: "send_message",
      status: "failed",
      detail: error.message,
      output: {},
      error: "message_insert_failed",
    };
  }
  return {
    action: "send_message",
    status: "succeeded",
    detail: "Message sent to customer",
    output: { sent: true },
  };
}

// ---------------------------------------------------------------------
// recordAgentAction — persistence for the structured agent-action trail
// ---------------------------------------------------------------------
export async function recordAgentAction(
  db: SupabaseClient,
  caseUuid: string,
  agentKey: string,
  action: string,
  status: "proposed" | "executing" | "succeeded" | "failed" | "blocked",
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  error?: string,
): Promise<string | null> {
  const { data, error: err } = await db.from("resolveai_agent_actions").insert({
    case_id: caseUuid,
    agent_key: agentKey,
    action,
    status,
    input,
    output,
    error: error ?? null,
  }).select("id").single();
  if (err) {
    console.error("recordAgentAction failed", err.message);
    return null;
  }
  return (data as { id: string }).id;
}

export async function recordVerification(
  db: SupabaseClient,
  actionUuid: string | null,
  caseUuid: string,
  verification: VerificationResult,
): Promise<void> {
  await db.from("resolveai_action_verifications").insert({
    action_id: actionUuid,
    case_id: caseUuid,
    checks: verification.checks,
    overall: verification.overall,
  });
}
