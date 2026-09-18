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
import { db } from "./_shared/db.ts";
import { resolveCaller, bearerToken } from "./_shared/auth.ts";
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
    return jsonResponse({ error: "forbidden", detail: "Staff role required" }, 403);
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

  if (!gates.canAutoResolve) {
    await emitAudit(db, caseUuid, caller.actor, "supervisor", `block_${action}`, {
      decision: { gates: gates.gates, allowed: false },
      authority: gates.gates.authority,
      risk: gates.gates.risk,
    });
    return jsonResponse({
      ok: false,
      action,
      blocked: true,
      gates: gates.gates,
      detail: "Four-gate controller blocked the action.",
    }, 403);
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

async function handleAnalytics(): Promise<Response> {
  const { data, error } = await db.rpc("resolveai_analytics_snapshot");
  if (error) throw error;
  return jsonResponse({ ok: true, analytics: data });
}

async function handleIncidents(): Promise<Response> {
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

async function handleBootstrap(): Promise<Response> {
  if (!BOOT_ANON_KEY) return jsonResponse({ error: "anon_key_missing" }, 500);
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

async function handleSelfcheck(): Promise<Response> {
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
        return await handleAnalytics();
      case "incidents":
        return await handleIncidents();
      case "bootstrap":
        return await handleBootstrap();
      case "selfcheck":
        return await handleSelfcheck();
      default:
        return jsonResponse({ error: "unknown_route" }, 404);
    }
  } catch (err) {
    console.error("resolveai failed", err);
    return jsonResponse({ error: "internal_error", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
