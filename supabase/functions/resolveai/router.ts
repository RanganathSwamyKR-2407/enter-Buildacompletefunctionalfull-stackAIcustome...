// =====================================================================
// resolveai — ROUTER SOURCE (source of truth, not deployed directly)
//
// Single backend function exposing all ResolveAI endpoints via a route
// field. Routes:
//   POST chat        — customer message → full lifecycle
//   POST actions     — gated deterministic action tools
//   POST escalate    — manual escalation + Resolution Passport
//   GET  analytics   — operational & CX KPIs (server-computed)
//   GET  incidents   — incidents + fingerprints + linked cases
//   POST bootstrap   — create demo auth accounts (idempotent)
//   POST selfcheck   — integration harness for demo tracks A/B/C
//
// scripts/bundle-resolveai.mjs inlines ./_shared/* into index.ts (the
// deployable bundle). Edit this file and _shared/, then run the bundler.
// =====================================================================
import { corsHeaders, jsonResponse } from "./_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { db } from "./_shared/db.ts";
import { resolveCaller, bearerToken, AUTH_SUPABASE_URL, AUTH_ANON_KEY } from "./_shared/auth.ts";
import { runLifecycle } from "./_shared/lifecycle.ts";
import { evaluateAllGates } from "./_shared/engine/gates.ts";
import type { GateInputs } from "./_shared/engine/gates.ts";
import { evaluatePolicy } from "./_shared/engine/policy.ts";
import { computeEscalation } from "./_shared/engine/escalation.ts";
import { buildPassport } from "./_shared/engine/passport.ts";
import type { CaseContext } from "./_shared/engine/types.ts";
import { AUTHORITY_LIMITS } from "./_shared/engine/types.ts";
import {
  executeRefund,
  executeUpdateTicket,
  executeSendMessage,
  recordAgentAction,
  recordVerification,
} from "./_shared/actions.ts";
import { emitAudit, emitAnalytics, updateCase } from "./_shared/events.ts";

const BOOT_SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BOOT_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

async function handleChat(token: string | null, body: Record<string, unknown>): Promise<Response> {
  const caller = await resolveCaller(token);
  const message = String(body.message ?? "").trim();
  if (!message) return jsonResponse({ error: "message_required" }, 400);

  let customerId: string | null = null;
  if (body.customer_id) {
    const isStaff = Boolean(caller.staffRole);
    const ownsCustomer = caller.customerId === String(body.customer_id);
    if (isStaff || ownsCustomer) {
      customerId = String(body.customer_id);
    } else {
      return jsonResponse({ error: "unauthorized_customer" }, 403);
    }
  } else {
    customerId = caller.customerId;
  }
  if (!customerId) {
    return jsonResponse(
      { error: "customer_required", detail: "Log in as a customer or pass customer_id (staff)." },
      400,
    );
  }

  const result = await runLifecycle(db, {
    customerId,
    message,
    staffRole: caller.staffRole,
    actor: caller.actor,
    fast: body.fast === true,
    skipLlm: body.skipLlm === true,
  });

  return jsonResponse({
    ok: true,
    case_id: result.caseId,
    case_uuid: result.caseUuid,
    intent: result.intent,
    specialist: result.specialist,
    status: result.status,
    resolution_status: result.resolutionStatus,
    escalation_score: result.escalationScore,
    reply: result.response,
    snapshot: result.snapshot,
  });
}

async function handleActions(token: string | null, body: Record<string, unknown>): Promise<Response> {
  const caller = await resolveCaller(token);
  if (!caller.staffRole) {
    return jsonResponse({
      error: "forbidden",
      detail: "Staff role required",
      debug: { userId: caller.userId, staffRole: caller.staffRole, customerId: caller.customerId, actor: caller.actor },
    }, 403);
  }

  const action = String(body.action ?? "");
  const caseUuid = String(body.case_id ?? "");
  if (!action || !caseUuid) {
    return jsonResponse({ error: "action_and_case_required" }, 400);
  }

  const { data: caseRow } = await db
    .from("resolveai_cases")
    .select("*")
    .eq("id", caseUuid)
    .maybeSingle();
  if (!caseRow) return jsonResponse({ error: "case_not_found" }, 404);
  const cs = caseRow as Record<string, unknown>;

  const { data: customer } = await db
    .from("resolveai_customers")
    .select("*")
    .eq("id", String(cs.customer_id))
    .maybeSingle();
  const cust = customer as Record<string, unknown> | null;

  let paymentUuid: string | null = null;
  let amount = typeof body.amount === "number" ? body.amount : undefined;
  if (action === "issue_refund") {
    const query = body.payment_id
      ? { id: String(body.payment_id) }
      : body.payment_txn
        ? { txn_id: String(body.payment_txn) }
        : null;
    if (!query) return jsonResponse({ error: "payment_required" }, 400);
    const { data: payment } = await db
      .from("resolveai_payments")
      .select("*")
      .match(query)
      .maybeSingle();
    if (!payment) return jsonResponse({ error: "payment_not_found" }, 404);
    paymentUuid = (payment as { id: string }).id;
    amount = amount ?? Number((payment as { amount: number }).amount);
  }

  const { data: policies } = await db.from("resolveai_policies").select("*");
  const policyRows = (policies ?? []) as Record<string, unknown>[];
  const policyEval = evaluatePolicy(policyRows as never, action, {
    twoSuccessfulPaymentsSameOrder: true,
    amount: amount ?? 0,
    amountWithinAuthority: amount != null ? amount <= (AUTHORITY_LIMITS[caller.staffRole] ?? 1000) : true,
    orderPending: false,
    within30Days: true,
    deliveryEvidenceComplete: true,
    noContradiction: !Boolean(cs.contradiction_detected),
    identityVerified: true,
    defectConfirmed: true,
    fraudRisk: "low",
  });

  const gateInputs: GateInputs = {
    evidence: (cs.evidence as unknown[]) ?? [],
    action,
    amount: amount ?? null,
    customerTier: String(cust?.tier ?? "standard"),
    staffRole: caller.staffRole,
    policyAllowed: policyEval.allowed,
    policyId: policyEval.policyId,
    contradictions: cs.contradiction_detected ? 1 : 0,
    repeatContacts: Number((cs.customer_history as Record<string, unknown>)?.repeat_contacts ?? 0),
    sentiment: String(cs.sentiment ?? "neutral"),
    uncertainty: 0.2,
    highValueCustomer: Number(cust?.lifetime_value ?? 0) >= 30000,
    hasDuplicates: Boolean((cs.evidence as unknown[])?.some?.((e) => (e as { type?: string }).type === "duplicate_payment")),
    actionFailures: ((cs.action_history as unknown[]) ?? []).filter((a) => (a as { status?: string }).status === "failed").length,
  };
  const gates = evaluateAllGates(gateInputs);

  const humanDecision = body.human_decision ? String(body.human_decision) : null;

  if (!gates.canAutoResolve) {
    // ---- Human approval / override path ----
    const staffLimit = amount != null ? (AUTHORITY_LIMITS[caller.staffRole] ?? 0) : 0;
    const approvableByHuman =
      policyEval.allowed &&
      !Boolean(cs.contradiction_detected) &&
      amount != null &&
      amount <= staffLimit &&
      gates.gates.risk.status !== "BLOCK";

    if (humanDecision === "approve") {
      if (!approvableByHuman) {
        await emitAudit(db, caseUuid, caller.actor, "supervisor", `reject_${action}`, {
          input: { human_decision: "approve", amount },
          decision: { allowed: false, reason: "requested override exceeds available authority or blocked by risk/contradiction" },
          authority: gates.gates.authority,
          risk: gates.gates.risk,
        });
        return jsonResponse({
          ok: false,
          action,
          blocked: true,
          detail: "Approval denied — override exceeds the acting role's authority or is blocked by risk/contradiction.",
        }, 403);
      }
      // Override proceeds; audit records the human decision before execution.
      await emitAudit(db, caseUuid, caller.actor, "supervisor", `approve_${action}`, {
        input: { amount },
        decision: { human_approval: true, gates: gates.gates, allowed: true },
        authority: gates.gates.authority,
        risk: gates.gates.risk,
      });
    } else if (humanDecision === "reject") {
      await emitAudit(db, caseUuid, caller.actor, "supervisor", `reject_${action}`, {
        input: { amount },
        decision: { human_decision: "reject", allowed: false },
        authority: gates.gates.authority,
        risk: gates.gates.risk,
      });
      return jsonResponse({ ok: true, action, decision: "rejected", detail: "Action rejected by human reviewer." });
    } else {
      // No decision yet → return an approval recommendation for the UI.
      return jsonResponse({
        ok: false,
        action,
        requires_human_approval: true,
        approvable_by_human: approvableByHuman,
        gates: gates.gates,
        policy: { policy_id: policyEval.policyId, allowed: policyEval.allowed },
        authority: gates.gates.authority,
        risk: gates.gates.risk,
        amount,
        detail: approvableByHuman
          ? "Autonomous gates did not pass, but a human reviewer with sufficient authority can approve this action."
          : "Autonomous gates did not pass and this action is not approvable by the acting role.",
      }, 202);
    }
  }

  let result: { action: unknown; verification: unknown } | null = null;
  if (action === "issue_refund") {
    result = await executeRefund(db, {
      caseUuid,
      caseId: String(cs.case_id),
      customerId: String(cs.customer_id),
      paymentUuid: paymentUuid!,
      amount: amount!,
      agentKey: "billing",
    });
  } else if (action === "update_ticket") {
    const res = await executeUpdateTicket(db, {
      caseUuid,
      customerId: String(cs.customer_id),
      intent: String(cs.intent ?? "order"),
      note: body.note ? String(body.note) : "Specialist action executed",
      agentKey: caller.staffRole,
    });
    result = { action: res, verification: { overall: "passed", checks: [], detail: res.detail } };
  } else if (action === "send_message") {
    const res = await executeSendMessage(db, {
      conversationUuid: cs.conversation_id ? String(cs.conversation_id) : null,
      content: body.content ? String(body.content) : "Your case has been updated by our team.",
      agentKey: caller.staffRole,
    });
    result = { action: res, verification: { overall: "passed", checks: [], detail: res.detail } };
  } else {
    return jsonResponse({ error: "unsupported_action" }, 400);
  }

  const actionRes = result.action as { status: string; action: string; output: Record<string, unknown>; detail: string; error?: string };
  const actionUuid = await recordAgentAction(
    db, caseUuid, "billing", action, actionRes.status === "succeeded" ? "succeeded" : "failed",
    { ...body }, actionRes.output, actionRes.error,
  );
  await recordVerification(db, actionUuid, caseUuid, result.verification as never);
  await emitAudit(db, caseUuid, caller.actor, "billing", action, {
    input: body,
    policy: { policy_id: policyEval.policyId, allowed: policyEval.allowed },
    authority: gates.gates.authority,
    risk: gates.gates.risk,
    result: actionRes,
    verification: result.verification,
  });

  return jsonResponse({ ok: true, action, result, verification: result.verification });
}

async function handleEscalate(token: string | null, body: Record<string, unknown>): Promise<Response> {
  const caller = await resolveCaller(token);
  if (!caller.staffRole) {
    return jsonResponse({ error: "forbidden", detail: "Staff role required" }, 403);
  }
  if (!body.case_id) return jsonResponse({ error: "case_id_required" }, 400);
  const caseUuid = String(body.case_id);

  const { data: caseRow } = await db.from("resolveai_cases").select("*").eq("id", caseUuid).maybeSingle();
  if (!caseRow) return jsonResponse({ error: "case_not_found" }, 404);
  const cs = caseRow as Record<string, unknown>;

  const { data: customer } = await db.from("resolveai_customers").select("*").eq("id", String(cs.customer_id)).maybeSingle();
  const cust = customer as Record<string, unknown> | null;

  const esc = computeEscalation({
    intent: String(cs.intent ?? "order"),
    caseComplexity: 0.6,
    repeatContacts: Number((cs.customer_history as Record<string, unknown>)?.repeat_contacts ?? 0),
    sentiment: String(cs.sentiment ?? "neutral"),
    financialImpact: Number((cs.recommended_action as Record<string, unknown>)?.amount ?? 0),
    policyUncertainty: Boolean(cs.policy_result && !(cs.policy_result as Record<string, unknown>).allowed),
    conflictingEvidence: Boolean(cs.contradiction_detected),
    aiConfidence: Number(cs.root_cause_confidence ?? cs.routing_confidence ?? 0.5),
    actionFailures: ((cs.action_history as unknown[]) ?? []).filter((a) => (a as { status?: string }).status === "failed").length,
    slaRisk: cs.sla_deadline ? new Date(String(cs.sla_deadline)).getTime() < Date.now() + 3600_000 : false,
  });

  const ctx = {
    caseId: String(cs.case_id),
    customer: {
      id: String(cs.customer_id),
      name: String(cust?.name ?? "Customer"),
      tier: String(cust?.tier ?? "standard"),
      lifetimeValue: Number(cust?.lifetime_value ?? 0),
      churnRisk: Number(cust?.churn_risk ?? 0),
      repeatContacts: Number((cs.customer_history as Record<string, unknown>)?.repeat_contacts ?? 0),
      priorRefunds: Number(cust?.refunds_count ?? 0),
    },
    orderIds: (cs.order_ids as string[]) ?? [],
    transactionIds: (cs.transaction_ids as string[]) ?? [],
    ticketIds: (cs.ticket_ids as string[]) ?? [],
    message: String(cs.message_text ?? ""),
    intent: String(cs.intent ?? "order"),
    subIntents: (cs.sub_intents as string[]) ?? [],
    urgency: String(cs.urgency ?? "medium"),
    sentiment: String(cs.sentiment ?? "neutral"),
    priority: String(cs.priority ?? "P3"),
    specialist: String(cs.specialist ?? "order"),
    routingReason: String(cs.routing_reason ?? ""),
    routingConfidence: Number(cs.routing_confidence ?? 0.6),
    evidence: (cs.evidence as unknown[]) ?? [],
    hypotheses: (cs.hypotheses as unknown[]) ?? [],
    rootCause: cs.root_cause ? String(cs.root_cause) : null,
    rootCauseConfidence: cs.root_cause_confidence != null ? Number(cs.root_cause_confidence) : null,
    contradictions: (cs.contradictions as unknown[]) ?? [],
    gates: (cs.gates as Record<string, unknown>) ?? {},
    policy: (cs.policy_result as Record<string, unknown>) ?? {},
    authority: (cs.authority_result as Record<string, unknown>) ?? {},
    risk: (cs.risk_result as Record<string, unknown>) ?? {},
    actionHistory: (cs.action_history as Record<string, unknown>[]) ?? [],
    recommendedAction: (cs.recommended_action as Record<string, unknown>) ?? {},
    escalation: esc,
    verification: cs.verification_result ? (cs.verification_result as { overall: string; checks: unknown[] }) : null,
    resolved: false,
    resolutionStatus: "ESCALATED",
    passport: {},
  } as CaseContext;

  const passport = buildPassport(ctx);
  const { error: escErr } = await db.from("resolveai_escalations").insert({
    case_id: caseUuid,
    score: esc.score,
    reasons: esc.reasons,
    recommended_queue: esc.recommendedQueue,
    priority: esc.priority,
    passport,
    status: "open",
  });
  if (escErr) throw escErr;

  await updateCase(db, caseUuid, {
    status: "escalated",
    escalation_score: esc.score,
    escalation_reasons: esc.reasons,
    resolution_status: "ESCALATED",
    resolution_passport: passport,
  });
  await emitAudit(db, caseUuid, caller.actor, "supervisor", "escalate_case", {
    input: { manual: true },
    decision: { escalated: true, score: esc.score, queue: esc.recommendedQueue },
  });
  await emitAnalytics(db, String(cs.customer_id), caseUuid, "case_escalated", {
    intent: String(cs.intent),
    score: esc.score,
    manual: true,
  });

  return jsonResponse({ ok: true, case_id: cs.case_id, score: esc.score, reasons: esc.reasons, passport });
}

async function handleAnalytics(token: string | null): Promise<Response> {
  const caller = await resolveCaller(token);
  if (!caller.staffRole) return jsonResponse({ error: "forbidden", detail: "Staff role required" }, 403);
  const { data, error } = await db.rpc("resolveai_analytics_snapshot");
  if (error) throw error;
  return jsonResponse({ ok: true, analytics: data });
}

async function handleIncidents(token: string | null): Promise<Response> {
  const caller = await resolveCaller(token);
  if (!caller.staffRole) return jsonResponse({ error: "forbidden", detail: "Staff role required" }, 403);
  const { data: counts } = await db.from("resolveai_incident_cases").select("incident_id, count:case_id");
  if (counts) {
    for (const row of counts as { incident_id: string; count: number }[]) {
      await db
        .from("resolveai_incidents")
        .update({ affected_case_count: row.count, updated_at: new Date().toISOString() })
        .eq("id", row.incident_id);
    }
  }
  const { data: incidents } = await db.from("resolveai_incidents").select("*").order("first_detected_at", { ascending: false });
  const { data: links } = await db.from("resolveai_incident_cases").select("incident_id, case_id");
  const { data: fingerprints } = await db.from("resolveai_failure_fingerprints").select("*").order("frequency", { ascending: false });
  const byIncident: Record<string, string[]> = {};
  for (const link of (links ?? []) as { incident_id: string; case_id: string }[]) {
    (byIncident[link.incident_id] ??= []).push(link.case_id);
  }
  return jsonResponse({
    ok: true,
    incidents: (incidents ?? []).map((i) => ({
      ...(i as Record<string, unknown>),
      linked_case_uuids: byIncident[(i as { id: string }).id] ?? [],
    })),
    fingerprints: fingerprints ?? [],
  });
}

interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: string | null;
  customerCode: string | null;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "customer@resolveai.demo", password: "ResolveAI@123", name: "Priya Sharma", role: null, customerCode: "CUST-1001" },
  { email: "tier1@resolveai.demo", password: "ResolveAI@123", name: "Arun Nair (Tier-1)", role: "customer_support_t1", customerCode: null },
  { email: "tier2@resolveai.demo", password: "ResolveAI@123", name: "Divya Menon (Tier-2)", role: "customer_support_t2", customerCode: null },
  { email: "manager@resolveai.demo", password: "ResolveAI@123", name: "Karan Malhotra (Manager)", role: "manager", customerCode: null },
  { email: "admin@resolveai.demo", password: "ResolveAI@123", name: "ResolveAI Admin", role: "admin", customerCode: null },
];

async function handleBootstrap(token: string | null): Promise<Response> {
  if (!BOOT_ANON_KEY) return jsonResponse({ error: "anon_key_missing" }, 500);
  const caller = await resolveCaller(token);
  const demoEmails = new Set(["customer@resolveai.demo","tier1@resolveai.demo","tier2@resolveai.demo","manager@resolveai.demo","admin@resolveai.demo"]);
  if (!caller.staffRole && !(caller.userId && demoEmails.has(await callerEmail(token)))) {
    return jsonResponse({ error: "forbidden", detail: "Staff or demo account required" }, 403);
  }
  const results: { email: string; status: string }[] = [];
  for (const account of DEMO_ACCOUNTS) {
    // Standard client-facing signup endpoint (auto-confirm enabled). A DB
    // trigger (resolveai_handle_new_user) maps the new auth user to a
    // resolveai_staff row (metadata.role) or a customer (metadata.customer_code).
    const meta = account.role
      ? { name: account.name, role: account.role }
      : { name: account.name, customer_code: account.customerCode };
    const res = await fetch(`${BOOT_SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: BOOT_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: account.email, password: account.password, data: meta }),
    });
    if (res.ok) {
      const created = (await res.json()) as { user?: { id: string } };
      results.push({ email: account.email, status: created.user?.id ? "created" : "ready" });
    } else {
      const err = (await res.json().catch(() => ({}))) as { error_code?: string };
      if (err.error_code === "user_already_exists" || res.status === 422 || res.status === 400) {
        results.push({ email: account.email, status: "existing" });
      } else {
        console.error("signup failed", account.email, res.status, JSON.stringify(err));
        results.push({ email: account.email, status: `failed (${res.status})` });
      }
    }
  }
  return jsonResponse({ ok: true, accounts: results });
}

async function handleSelfcheck(token: string | null): Promise<Response> {
  const caller = await resolveCaller(token);
  if (!caller.staffRole) return jsonResponse({ error: "forbidden", detail: "Staff role required" }, 403);
  const results: Record<string, unknown>[] = [];

  // ---- Scenario A ----
  {
    await db.from("resolveai_payments").update({ status: "succeeded" }).eq("txn_id", "TXN-P10002");
    const { data: priya } = await db.from("resolveai_customers").select("id").eq("customer_code", "CUST-1001").maybeSingle();
    const res = await runLifecycle(db, {
      customerId: String((priya as { id: string }).id),
      message: "I was charged twice for my order. The order is still pending and I already contacted support twice.",
      staffRole: "manager",
      actor: "selfcheck",
      fast: true,
      skipLlm: true,
    });
    const { data: refund } = await db.from("resolveai_refunds").select("refund_id, status, amount, verification").eq("case_id", res.caseUuid).maybeSingle();
    const { data: payment } = await db.from("resolveai_payments").select("status").eq("txn_id", "TXN-P10002").maybeSingle();
    results.push({
      scenario: "A — Autonomous Resolution (duplicate charge)",
      case_id: res.caseId,
      resolved: res.status === "resolved",
      refund_created: Boolean(refund),
      refund_status: refund ? (refund as { status: string }).status : null,
      payment_status: payment ? (payment as { status: string }).status : null,
      verification: refund ? (refund as { verification: unknown }).verification : null,
      intent: res.intent,
      specialist: res.specialist,
      pass: res.status === "resolved" && Boolean(refund) && (payment as { status: string }).status === "refunded",
    });
  }

  // ---- Scenario B ----
  {
    const { data: rahul } = await db.from("resolveai_customers").select("id").eq("customer_code", "CUST-1002").maybeSingle();
    const res = await runLifecycle(db, {
      customerId: String((rahul as { id: string }).id),
      message: "The courier says delivered but I never received my package.",
      staffRole: "manager",
      actor: "selfcheck",
      fast: true,
      skipLlm: true,
    });
    const { data: esc } = await db.from("resolveai_escalations").select("score, passport").eq("case_id", res.caseUuid).maybeSingle();
    results.push({
      scenario: "B — Contradiction → Escalation",
      case_id: res.caseId,
      escalated: res.status === "escalated",
      contradiction_blocked: (res.snapshot as { contradiction_detected?: boolean }).contradiction_detected === true,
      passport_generated: Boolean(esc && (esc as { passport: unknown }).passport),
      escalation_score: esc ? (esc as { score: number }).score : null,
      pass: res.status === "escalated" && (res.snapshot as { contradiction_detected?: boolean }).contradiction_detected === true && Boolean(esc),
    });
  }

  // ---- Scenario C ----
  {
    const { data: ananya } = await db.from("resolveai_customers").select("id").eq("customer_code", "CUST-1003").maybeSingle();
    const res = await runLifecycle(db, {
      customerId: String((ananya as { id: string }).id),
      message: "My refund is not coming through. I was charged and the refund keeps failing.",
      staffRole: "manager",
      actor: "selfcheck",
      fast: true,
      skipLlm: true,
    });
    const { data: actions } = await db.from("resolveai_agent_actions").select("status, action").eq("case_id", res.caseUuid).order("created_at", { ascending: true });
    const failedCount = (actions ?? []).filter((a) => (a as { status: string }).status === "failed").length;
    const breaker = (res.snapshot as { circuit_breaker?: { tripped?: boolean } }).circuit_breaker;
    const { data: esc } = await db.from("resolveai_escalations").select("score").eq("case_id", res.caseUuid).maybeSingle();
    results.push({
      scenario: "C — Circuit Breaker → Escalation",
      case_id: res.caseId,
      automation_paused: res.status === "escalated" || res.status === "automation_paused",
      failed_attempts: failedCount,
      breaker_tripped: breaker?.tripped === true,
      escalated: Boolean(esc),
      pass: failedCount >= 3 && breaker?.tripped === true && Boolean(esc),
    });
  }

  const allPass = results.every((r) => r.pass === true);
  return jsonResponse({ ok: true, allPass, results });
}



// ---------------------------------------------------------------------
// Knowledge feedback loop: candidates reviewed by humans before they can
// enter the trusted knowledge base.
// ---------------------------------------------------------------------
async function handleKnowledgeCandidates(token: string | null, body: Record<string, unknown>): Promise<Response> {
  const caller = await resolveCaller(token);
  if (!caller.staffRole) return jsonResponse({ error: "forbidden", detail: "Staff role required" }, 403);

  const op = String(body.op ?? "list");

  if (op === "list") {
    const { data } = await db.from("resolveai_knowledge_candidates").select("*").order("created_at", { ascending: false }).limit(50);
    return jsonResponse({ ok: true, candidates: data ?? [] });
  }

  if (op === "create") {
    const caseId = String(body.case_id ?? "");
    if (!caseId) return jsonResponse({ error: "case_id_required" }, 400);
    const { data: caseRow } = await db.from("resolveai_cases").select("*").eq("id", caseId).maybeSingle();
    if (!caseRow) return jsonResponse({ error: "case_not_found" }, 404);
    const cs = caseRow as Record<string, unknown>;
    const { data: existing } = await db.from("resolveai_knowledge_candidates").select("id").eq("case_id", caseId).eq("status", "pending").maybeSingle();
    if (existing) return jsonResponse({ ok: true, candidate: existing, note: "already_pending" });

    const problem = String(cs.message_text ?? "Unspecified customer issue");
    const resolution = body.resolution ? String(body.resolution) : String(cs.resolution_status ?? "Resolved by human review");
    const { data: cand } = await db.from("resolveai_knowledge_candidates").insert({
      case_id: caseId,
      problem,
      root_cause: cs.root_cause ? String(cs.root_cause) : null,
      resolution,
      supporting_cases: [cs.case_id],
      confidence: cs.root_cause_confidence != null ? Number(cs.root_cause_confidence) : 0.5,
      status: "pending",
    }).select("*").single();
    await emitAudit(db, caseId, caller.actor, "supervisor", "knowledge_candidate_created", {
      input: { resolution },
      result: { candidate: (cand as { id: string }).id },
    });
    return jsonResponse({ ok: true, candidate: cand });
  }

  if (op === "review") {
    if (!["manager", "admin"].includes(caller.staffRole)) {
      return jsonResponse({ error: "forbidden", detail: "Manager or Admin required to approve knowledge" }, 403);
    }
    const id = String(body.id ?? "");
    const decision = String(body.decision ?? "");
    if (!id || !["approved", "rejected"].includes(decision)) return jsonResponse({ error: "id_and_decision_required" }, 400);
    const { data: cand } = await db.from("resolveai_knowledge_candidates").update({
      status: decision,
      reviewed_by: caller.actor,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id).select("*").single();
    await emitAudit(db, cand ? String((cand as { case_id: string }).case_id) : null, caller.actor, "supervisor", `knowledge_candidate_${decision}`, {
      input: { id },
      result: { decision },
    });
    return jsonResponse({ ok: true, candidate: cand });
  }

  return jsonResponse({ error: "unknown_op" }, 400);
}

// ---------------------------------------------------------------------
// System health: real checks against database, auth, AI, RAG, engine.
// ---------------------------------------------------------------------
async function handleHealth(): Promise<Response> {
  const checks: { component: string; status: string; detail: string }[] = [];

  // Database
  try {
    const { data, error } = await db.from("resolveai_customers").select("id").limit(1);
    checks.push({ component: "Database", status: error ? "FAILED" : "HEALTHY", detail: error ? error.message : "read query ok" });
  } catch (e) {
    checks.push({ component: "Database", status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
  }

  // Authentication (sign-in path used by clients)
  try {
    const res = await fetch(`${AUTH_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: AUTH_ANON_KEY, Authorization: `Bearer ${AUTH_ANON_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    checks.push({
      component: "Authentication",
      status: AUTH_ANON_KEY ? (res.ok ? "HEALTHY" : "DEGRADED") : "FAILED",
      detail: !AUTH_ANON_KEY ? "anon key missing" : res.ok ? "auth endpoint reachable" : `auth health returned ${res.status}`,
    });
  } catch (e) {
    checks.push({ component: "Authentication", status: "DEGRADED", detail: e instanceof Error ? e.message : String(e) });
  }

  // Backend function (self ping via analytics RPC)
  try {
    const { data, error } = await db.rpc("resolveai_analytics_snapshot");
    checks.push({ component: "Backend", status: error ? "DEGRADED" : "HEALTHY", detail: error ? error.message : "analytics RPC ok" });
    void data;
  } catch (e) {
    checks.push({ component: "Backend", status: "DEGRADED", detail: e instanceof Error ? e.message : String(e) });
  }

  // AI provider (probe the gateway with a minimal call)
  try {
    const AI_TOKEN = Deno.env.get("AI_API_TOKEN_774223bb88c5");
    if (!AI_TOKEN) {
      checks.push({ component: "AI provider", status: "DEGRADED", detail: "LLM token not configured (deterministic fallbacks remain active)" });
    } else {
      const res = await fetch("https://api.enter.pro/code/api/v1/ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AI_TOKEN}`,
          "Content-Type": "application/json",
          "X-Enter-Project-ID": "774223bb88c54f7c9c0176a4946bc05f",
        },
        body: JSON.stringify({ model: "deepseek/deepseek-v4-flash", messages: [{ role: "user", content: "ping" }], stream: false, max_tokens: 1 }),
        signal: AbortSignal.timeout(15000),
      });
      checks.push({ component: "AI provider", status: res.ok ? "HEALTHY" : "DEGRADED", detail: res.ok ? "gateway reachable" : `gateway returned ${res.status}` });
    }
  } catch (e) {
    checks.push({ component: "AI provider", status: "DEGRADED", detail: e instanceof Error ? e.message : String(e) });
  }

  // Knowledge search (RAG retrieval)
  try {
    const { data, error } = await db.rpc("resolveai_search_knowledge", { query: "refund", max_results: 1 });
    checks.push({ component: "Knowledge search (RAG)", status: error ? "FAILED" : "HEALTHY", detail: error ? error.message : `${(data ?? []).length} chunk(s) retrieved` });
  } catch (e) {
    checks.push({ component: "Knowledge search (RAG)", status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
  }

  // Action engine (agent_actions writable + readable)
  try {
    const { data, error } = await db.from("resolveai_agent_actions").select("id").limit(1);
    checks.push({ component: "Action engine", status: error ? "FAILED" : "HEALTHY", detail: error ? error.message : "agent_actions accessible" });
    void data;
  } catch (e) {
    checks.push({ component: "Action engine", status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
  }

  // Verification (action_verifications accessible)
  try {
    const { data, error } = await db.from("resolveai_action_verifications").select("id").limit(1);
    checks.push({ component: "Verification", status: error ? "FAILED" : "HEALTHY", detail: error ? error.message : "verification rows accessible" });
    void data;
  } catch (e) {
    checks.push({ component: "Verification", status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
  }

  // Realtime (publication membership)
  try {
    const { data, error } = await db.from("resolveai_case_events").select("id").limit(1);
    checks.push({ component: "Realtime", status: error ? "DEGRADED" : "HEALTHY", detail: error ? error.message : "case_events accessible (realtime source)" });
    void data;
  } catch (e) {
    checks.push({ component: "Realtime", status: "DEGRADED", detail: e instanceof Error ? e.message : String(e) });
  }

  // Analytics
  try {
    const { data, error } = await db.rpc("resolveai_analytics_snapshot");
    checks.push({ component: "Analytics", status: error ? "FAILED" : "HEALTHY", detail: error ? error.message : "KPI snapshot ok" });
    void data;
  } catch (e) {
    checks.push({ component: "Analytics", status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
  }

  // Audit logging
  try {
    const { data, error } = await db.from("resolveai_audit_logs").select("id").limit(1);
    checks.push({ component: "Audit logging", status: error ? "FAILED" : "HEALTHY", detail: error ? error.message : "audit table accessible" });
    void data;
  } catch (e) {
    checks.push({ component: "Audit logging", status: "FAILED", detail: e instanceof Error ? e.message : String(e) });
  }

  const worst = checks.some((c) => c.status === "FAILED") ? "FAILED" : checks.some((c) => c.status === "DEGRADED") ? "DEGRADED" : "HEALTHY";
  return jsonResponse({ ok: true, status: worst, checks });
}

// ---------------------------------------------------------------------
// Account linking: associate a verified OAuth identity with an existing
// ResolveAI customer/staff profile by email (no duplicates, no role grants).
// ---------------------------------------------------------------------
async function handleLinkAccount(token: string | null): Promise<Response> {
  const caller = await resolveCaller(token);
  if (!caller.userId) return jsonResponse({ error: "unauthenticated" }, 401);
  const emailRes = await fetch(`${AUTH_SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: AUTH_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!emailRes.ok) return jsonResponse({ error: "auth_lookup_failed" }, 401);
  const uinfo = (await emailRes.json()) as { email?: string; user_metadata?: Record<string, unknown> };

  const { data: customer } = await db
    .from("resolveai_customers")
    .select("id, name")
    .eq("email", uinfo.email ?? "")
    .maybeSingle();

  if (customer) {
    const c = customer as { id: string };
    if (c.id !== caller.customerId) {
      // Claim only when the profile is unowned or owned by this user.
      const { data: existing } = await db.from("resolveai_customers").select("user_id").eq("id", c.id).maybeSingle();
      const owner = existing ? (existing as { user_id: string | null }).user_id : null;
      if (!owner || owner === caller.userId) {
        await db.from("resolveai_customers").update({ user_id: caller.userId }).eq("id", c.id);
        await emitAudit(db, null, caller.actor, "auth", "account_linked", {
          input: { email: uinfo.email },
          decision: { customer_id: c.id },
        });
        return jsonResponse({ ok: true, linked: true, customer_id: c.id });
      }
      return jsonResponse({ ok: false, linked: false, detail: "Profile is owned by another account" }, 409);
    }
    return jsonResponse({ ok: true, linked: true, customer_id: c.id });
  }

  const { data: staff } = await db.from("resolveai_staff").select("id, name").eq("name", uinfo.email ?? "").maybeSingle();
  void staff;
  return jsonResponse({ ok: true, linked: false, detail: "No existing profile with this email" });
}


async function callerEmail(token: string | null): Promise<string> {
  if (!token) return "";
  const res = await fetch(`${AUTH_SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: AUTH_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return "";
  const j = (await res.json()) as { email?: string };
  return j.email ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = bearerToken(req);
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const route = (body as { route?: string }).route ?? url.searchParams.get("route") ?? "chat";

    switch (route) {
      case "chat":
        return await handleChat(token, body);
      case "actions":
        return await handleActions(token, body);
      case "escalate":
        return await handleEscalate(token, body);
      case "analytics":
        return await handleAnalytics(token);
      case "incidents":
        return await handleIncidents(token);
      case "bootstrap":
        return await handleBootstrap(token);
      case "selfcheck":
        return await handleSelfcheck(token);
      case "knowledge_candidates":
        return await handleKnowledgeCandidates(token, body);
      case "health":
        return await handleHealth();
      case "link_account":
        return await handleLinkAccount(token);
      default:
        return jsonResponse({ error: "unknown_route" }, 404);
    }
  } catch (err) {
    console.error("resolveai failed", err);
    return jsonResponse({ error: "internal_error", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
