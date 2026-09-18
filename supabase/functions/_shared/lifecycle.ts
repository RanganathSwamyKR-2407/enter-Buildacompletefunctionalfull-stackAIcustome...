// =====================================================================
// ResolveAI — lifecycle orchestrator (supervisor agent)
//
// Customer message → context → understanding → routing → specialist
// investigation → RAG retrieval → root-cause analysis → four-gate
// controller → action (circuit breaker + verification) → resolve or
// escalate → audit → analytics → incident detection.
//
// The LLM proposes; deterministic code controls execution.
// =====================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  emitCaseEvent,
  emitAudit,
  emitAnalytics,
  updateCase,
  sleep,
} from "./events.ts";
import {
  executeRefund,
  executeUpdateTicket,
  executeSendMessage,
  recordAgentAction,
  recordVerification,
} from "./actions.ts";
import { detectAndRecordIncident } from "./incidents.ts";
import { routeTicket, fallbackResponse } from "./engine/classify.ts";
import { evaluateAllGates } from "./engine/gates.ts";
import type { GateInputs } from "./engine/gates.ts";
import { computeEscalation } from "./engine/escalation.ts";
import { detectContradictions } from "./engine/safety.ts";
import type { Contradiction, EvidenceItem, Hypothesis } from "./engine/types.ts";
import { SLA_HOURS, AUTHORITY_LIMITS } from "./engine/types.ts";
import { evaluatePolicy } from "./engine/policy.ts";
import { llmUnderstand, llmHypothesize, llmRespond } from "./llm.ts";

export interface LifecycleRequest {
  customerId: string; // resolveai_customers.id
  message: string;
  staffRole?: string | null;
  actor?: string;
  fast?: boolean; // true disables the demo pacing delays (self-check)
}

export interface LifecycleResult {
  caseUuid: string;
  caseId: string;
  response: string;
  status: string;
  resolutionStatus: string | null;
  intent: string;
  specialist: string;
  escalationScore: number | null;
  snapshot: Record<string, unknown>;
}

const MIN_AUTO_CONFIDENCE = 0.6;
const STAGE_DELAY = 420;
const ACTION_DELAY = 500;

async function nextCaseId(db: SupabaseClient): Promise<string> {
  const { data } = await db
    .from("resolveai_cases")
    .select("case_id")
    .order("case_id", { ascending: false })
    .limit(1);
  const last = data && data.length > 0
    ? Number((data[0] as { case_id: string }).case_id.slice(3))
    : 5000;
  return `CS-${String(last + 1).padStart(4, "0")}`;
}

export async function runLifecycle(
  db: SupabaseClient,
  req: LifecycleRequest,
): Promise<LifecycleResult> {
  const delay = req.fast ? 0 : STAGE_DELAY;
  const actor = req.actor ?? "customer";

  // -----------------------------------------------------------------
  // 1. Customer + context
  // -----------------------------------------------------------------
  const { data: customer } = await db
    .from("resolveai_customers")
    .select("*")
    .eq("id", req.customerId)
    .maybeSingle();
  if (!customer) {
    throw new Error("customer_not_found");
  }
  const cust = customer as Record<string, unknown>;

  const [{ data: orders }, { data: payments }, { data: tickets }, { data: conversations }] =
    await Promise.all([
      db.from("resolveai_orders").select("*").eq("customer_id", req.customerId).order("created_at", { ascending: false }).limit(8),
      db.from("resolveai_payments").select("*").eq("customer_id", req.customerId).order("created_at", { ascending: false }).limit(12),
      db.from("resolveai_tickets").select("*").eq("customer_id", req.customerId).order("created_at", { ascending: false }).limit(10),
      db.from("resolveai_conversations").select("*").eq("customer_id", req.customerId).eq("status", "active").limit(1),
    ]);

  const openConvo = conversations && conversations.length > 0
    ? (conversations[0] as { id: string })
    : null;
  const repeatContacts = (tickets ?? []).length;

  // Conversation + message
  let convoUuid = openConvo?.id ?? null;
  if (!convoUuid) {
    const { data: newConvo } = await db
      .from("resolveai_conversations")
      .insert({ customer_id: req.customerId, status: "active" })
      .select("id")
      .single();
    convoUuid = (newConvo as { id: string }).id;
  }
  await db.from("resolveai_messages").insert({
    conversation_id: convoUuid,
    role: "customer",
    content: req.message,
  });

  // Case Twin row
  const caseId = await nextCaseId(db);
  const caseUuid = crypto.randomUUID();
  await db.from("resolveai_cases").insert({
    id: caseUuid,
    case_id: caseId,
    customer_id: req.customerId,
    conversation_id: convoUuid,
    message_text: req.message,
    status: "investigating",
    created_at: new Date().toISOString(),
  });

  // -----------------------------------------------------------------
  // 2. Understanding (LLM + deterministic fusion)
  // -----------------------------------------------------------------
  await emitCaseEvent(db, caseUuid, "evidence_ingest", "Evidence Ingest", "running");
  await sleep(delay);
  await emitCaseEvent(db, caseUuid, "understanding", "AI Understanding", "running");

  const customerContext = [
    `tier ${cust.tier}`,
    `lifetime value ₹${cust.lifetime_value}`,
    `${repeatContacts} previous support contacts`,
    `${(tickets ?? []).length} prior tickets`,
    `${(orders ?? []).length} orders`,
  ].join(", ");
  const llmU = await llmUnderstand(req.message, customerContext);
  const routed = routeTicket({
    message: req.message,
    customerRepeatContacts: repeatContacts,
    llmUnderstanding: llmU,
  });
  const slaDeadline = new Date(
    Date.now() + (SLA_HOURS[routed.priority] ?? 24) * 3600_000,
  ).toISOString();
  await updateCase(db, caseUuid, {
    intent: routed.intent,
    sub_intents: routed.subIntents,
    urgency: routed.urgency,
    sentiment: routed.sentiment,
    sentiment_score: routed.sentimentScore,
    priority: routed.priority,
    specialist: routed.specialist,
    routing_reason: routed.routingReason,
    routing_confidence: routed.confidence,
    sla_deadline: slaDeadline,
  });
  await emitCaseEvent(db, caseUuid, "understanding", "AI Understanding", "ok", {
    intent: routed.intent,
    sub_intents: routed.subIntents,
    urgency: routed.urgency,
    sentiment: routed.sentiment,
    confidence: routed.confidence,
  });

  // -----------------------------------------------------------------
  // 3. Specialist investigation
  // -----------------------------------------------------------------
  const evidence: EvidenceItem[] = [];
  evidence.push({
    id: "EV-CUST-1",
    source: "customers",
    type: "customer_profile",
    label: `Customer ${cust.name} (${cust.tier} tier)`,
    value: cust.customer_code,
    known: true,
  });

  // Order audit
  await emitCaseEvent(db, caseUuid, "order_audit", "Order Audit", "running");
  await sleep(delay);
  const orderList = (orders ?? []).map((o) => o as Record<string, unknown>);
  for (const o of orderList.slice(0, 3)) {
    evidence.push({
      id: `EV-ORD-${String(o.order_id)}`,
      source: "orders",
      type: "order",
      label: `Order ${o.order_id}: ${o.status} (₹${o.amount})`,
      value: o.order_id,
      known: true,
    });
  }
  const pendingOrders = orderList.filter((o) => o.status === "pending");
  await emitCaseEvent(db, caseUuid, "order_audit", "Order Audit", "ok", {
    orders_found: orderList.length,
    pending: pendingOrders.length,
  }, evidence.length);

  // Payment audit
  await emitCaseEvent(db, caseUuid, "payment_audit", "Payment Audit", "running");
  await sleep(delay);
  const payList = (payments ?? []).map((p) => p as Record<string, unknown>);
  const succeeded = payList.filter((p) => p.status === "succeeded");
  for (const p of payList.slice(0, 6)) {
    evidence.push({
      id: `EV-PAY-${String(p.txn_id)}`,
      source: "payments",
      type: "payment",
      label: `Payment ${p.txn_id}: ${p.status} (₹${p.amount})`,
      value: p.txn_id,
      known: true,
    });
  }
  // Duplicate detection: ≥2 succeeded payments on the same order
  const byOrder = new Map<string, Record<string, unknown>[]>();
  for (const p of succeeded) {
    const key = String(p.order_id);
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key)!.push(p);
  }
  const duplicateGroups = [...byOrder.values()].filter((g) => g.length >= 2);
  const hasDuplicates = duplicateGroups.length > 0;
  const duplicateTarget = duplicateGroups.length > 0
    ? duplicateGroups[0].sort(
        (a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
      )[0]
    : null;
  const duplicateAmount = duplicateTarget ? Number(duplicateTarget.amount) : null;

  if (hasDuplicates && duplicateTarget) {
    evidence.push({
      id: "EV-DUP-1",
      source: "payments",
      type: "duplicate_payment",
      label: `Duplicate charge detected: ${duplicateGroups[0].length} successful payments on same order`,
      value: duplicateTarget.txn_id,
      known: true,
    });
  }
  // Sync issue: succeeded payment(s) + pending order
  const pendingOrderIds = new Set(pendingOrders.map((o) => String(o.id)));
  const syncIssue = succeeded.some((p) => pendingOrderIds.has(String(p.order_id)));
  if (syncIssue) {
    evidence.push({
      id: "EV-SYNC-1",
      source: "orders",
      type: "payment_order_sync",
      label: "Payment captured but order still pending — synchronization discrepancy",
      value: pendingOrders[0]?.order_id,
      known: true,
    });
  }
  await emitCaseEvent(db, caseUuid, "payment_audit", "Payment Audit", "ok", {
    transactions_found: payList.length,
    succeeded: succeeded.length,
    duplicate_detected: hasDuplicates,
  }, evidence.length);

  // Ticket history
  await emitCaseEvent(db, caseUuid, "ticket_history", "Ticket History", "running");
  await sleep(delay);
  const ticketList = (tickets ?? []).map((t) => t as Record<string, unknown>);
  for (const t of ticketList.slice(0, 4)) {
    evidence.push({
      id: `EV-TCK-${String(t.ticket_id)}`,
      source: "tickets",
      type: "ticket",
      label: `Ticket ${t.ticket_id}: ${t.subject}`,
      value: t.ticket_id,
      known: true,
    });
  }
  await emitCaseEvent(db, caseUuid, "ticket_history", "Ticket History", "ok", {
    prior_tickets: ticketList.length,
  }, evidence.length);

  // -----------------------------------------------------------------
  // 4. Knowledge retrieval (RAG)
  // -----------------------------------------------------------------
  await emitCaseEvent(db, caseUuid, "knowledge_retrieval", "Knowledge Retrieval", "running");
  await sleep(delay);
  const searchQuery = req.message.toLowerCase().slice(0, 120);
  const { data: rag } = await db.rpc("resolveai_search_knowledge", {
    query: searchQuery,
    max_results: 4,
  });
  const ragRows = (rag ?? []) as Record<string, unknown>[];
  const sources = ragRows.map((r) => ({
    doc_id: r.doc_id,
    title: r.title,
    section: `chunk #${r.chunk_index}`,
    score: Number(r.score ?? 0),
    reason: r.title,
  }));
  for (const r of ragRows) {
    evidence.push({
      id: `EV-RAG-${String(r.doc_id)}-${String(r.chunk_index)}`,
      source: "knowledge",
      type: "rag_chunk",
      label: `${r.title} (${r.category}) — ${String(r.content).slice(0, 90)}…`,
      value: { doc_id: r.doc_id, score: r.score },
      known: true,
      detail: `Retrieved with score ${Number(r.score ?? 0).toFixed(3)}`,
    });
  }
  await emitCaseEvent(db, caseUuid, "knowledge_retrieval", "Knowledge Retrieval", "ok", {
    sources,
    retrieved: ragRows.length,
  }, evidence.length);

  // -----------------------------------------------------------------
  // 5. Policy evaluation
  // -----------------------------------------------------------------
  await emitCaseEvent(db, caseUuid, "policy_evaluation", "Policy Evaluation", "running");
  await sleep(delay);
  const { data: policies } = await db.from("resolveai_policies").select("*");
  const policyRows = (policies ?? []) as Record<string, unknown>[];

  const recommendedAction = hasDuplicates && routed.intent === "billing" && duplicateTarget
    ? { action: "issue_refund", payment_txn: duplicateTarget.txn_id, amount: duplicateAmount }
    : { action: "update_ticket", note: "Investigation completed; needs specialist handling" };

  const facts = {
    twoSuccessfulPaymentsSameOrder: hasDuplicates,
    amount: duplicateAmount ?? 0,
    amountWithinAuthority: duplicateAmount != null
      ? duplicateAmount <= (AUTHORITY_LIMITS[String(cust.tier)] ?? 1000)
      : false,
    orderPending: pendingOrders.length > 0,
    within30Days: true,
    deliveryEvidenceComplete: true,
    noContradiction: true, // set below after contradiction detection
    identityVerified: true,
    defectConfirmed: false,
    fraudRisk: "low",
  };
  const policyEval = evaluatePolicy(
    policyRows as never,
    recommendedAction.action,
    facts,
  );
  await emitCaseEvent(db, caseUuid, "policy_evaluation", "Policy Evaluation", "ok", {
    policy: policyEval.policyId,
    allowed: policyEval.allowed,
    reason: policyEval.reason,
  }, evidence.length);

  // -----------------------------------------------------------------
  // 6. Root-cause analysis + contradiction detection
  // -----------------------------------------------------------------
  await emitCaseEvent(db, caseUuid, "root_cause_analysis", "Root Cause Analysis", "running");
  await sleep(delay);

  const customerClaimsNotReceived = /not received|never received|missing package|didn.t get|not got|not deliver/i.test(req.message);
  const deliveryOrder = orderList.find((o) => o.status === "delivered");
  const contradictions: Contradiction[] = deliveryOrder
    ? detectContradictions({
        orderStatus: String(deliveryOrder.status),
        shipmentStatus: String(deliveryOrder.shipment_status ?? ""),
        courier: deliveryOrder.courier ? String(deliveryOrder.courier) : null,
        gps: (deliveryOrder.gps_evidence as { matched?: boolean; distanceKm?: number; note?: string } | null) ?? null,
        customerClaimsNotReceived,
      })
    : [];

  const symptoms: string[] = [];
  if (hasDuplicates) symptoms.push("duplicate_transaction");
  if (syncIssue) symptoms.push("order_still_pending");
  if (contradictions.length > 0) {
    symptoms.push("customer_disputes", "gps_location_mismatch");
    if (deliveryOrder?.shipment_status === "delivered") symptoms.push("courier_claims_delivered");
  }

  // Deterministic root cause takes precedence when evidence is strong.
  let rootCause: string | null = null;
  let rootConfidence: number | null = null;
  let hypotheses: Hypothesis[] = [];
  const evidenceSummary = evidence.map((e) => `- [${e.source}] ${e.label}`).join("\n");
  const llmHyp = await llmHypothesize(req.message, evidenceSummary);
  if (llmHyp) {
    hypotheses = llmHyp.hypotheses.map((h, i) => ({
      ...h,
      evidenceIds: evidence.slice(0, 3).map((e) => e.id),
      confidence: Math.max(0, h.confidence),
    }));
  }

  if (hasDuplicates && syncIssue) {
    rootCause = "Payment/order synchronization failure — duplicate debit created while order stayed pending";
    rootConfidence = 0.92;
    hypotheses.unshift({
      title: "Payment-order synchronization failure",
      reasoning: "2 successful transactions share one order id that never left 'pending'; matches gateway-timeout duplicate pattern.",
      confidence: 0.92,
      evidenceIds: ["EV-DUP-1", "EV-SYNC-1"],
    });
  } else if (contradictions.length > 0) {
    rootCause = contradictions[0].label;
    rootConfidence = 0.88;
  } else if (llmHyp) {
    rootCause = llmHyp.root_cause;
    rootConfidence = llmHyp.hypotheses[0]?.confidence ?? 0.6;
  } else {
    rootCause = syncIssue
      ? "Payment captured while order remained pending"
      : "No dominant root cause — insufficient evidence";
    rootConfidence = syncIssue ? 0.8 : 0.51;
  }

  facts.noContradiction = contradictions.length === 0;
  await emitCaseEvent(db, caseUuid, "root_cause_analysis", "Root Cause Analysis", "ok", {
    root_cause: rootCause,
    confidence: rootConfidence,
    hypotheses: hypotheses.length,
    contradictions: contradictions.length,
  }, evidence.length);

  if (contradictions.length > 0) {
    await emitCaseEvent(db, caseUuid, "contradiction_check", "Contradiction Check", "warn", {
      contradictions: contradictions.map((c) => ({ type: c.type, label: c.label, evidence: c.evidence })),
    }, evidence.length);
  }

  // -----------------------------------------------------------------
  // 7. Four-gate controller
  // -----------------------------------------------------------------
  await emitCaseEvent(db, caseUuid, "four_gate_controller", "Four-Gate Controller", "running");
  await sleep(delay);
  const uncertainty = hasDuplicates ? 0.1 : contradictions.length > 0 ? 0.3 : 0.35;
  const gateInputs: GateInputs = {
    evidence,
    action: recommendedAction.action,
    amount: duplicateAmount,
    customerTier: String(cust.tier),
    staffRole: req.staffRole ?? null,
    policyAllowed: policyEval.allowed,
    policyId: policyEval.policyId,
    contradictions: contradictions.length,
    repeatContacts,
    sentiment: routed.sentiment,
    uncertainty,
    highValueCustomer: Number(cust.lifetime_value) >= 30000,
    hasDuplicates,
    actionFailures: 0,
  };
  const gates = evaluateAllGates(gateInputs);
  await updateCase(db, caseUuid, {
    evidence,
    evidence_count: evidence.length,
    hypotheses,
    root_cause: rootCause,
    root_cause_confidence: rootConfidence,
    contradictions,
    contradiction_detected: contradictions.length > 0,
    gates: gates.gates,
    recommended_action: recommendedAction,
    policy_result: { policy_id: policyEval.policyId, allowed: policyEval.allowed, reason: policyEval.reason },
    authority_result: gates.gates.authority,
    risk_result: gates.gates.risk,
  });
  await emitCaseEvent(db, caseUuid, "four_gate_controller", "Four-Gate Controller", "ok", {
    gates: Object.fromEntries(
      Object.entries(gates.gates).map(([k, g]) => [k, { status: g.status, detail: g.detail }]),
    ),
    can_auto_resolve: gates.canAutoResolve,
  });

  // -----------------------------------------------------------------
  // 8. Decision: act / resolve / escalate
  // -----------------------------------------------------------------
  const confidence = rootConfidence ?? routed.confidence;
  let response = "";
  let status = "action_required";
  let resolutionStatus: string | null = null;
  let escalationScore: number | null = null;
  let verification: { overall: string; checks: unknown[] } | null = null;

  // ---- Track B: contradiction → block + escalate ----
  if (contradictions.length > 0) {
    resolutionStatus = "ESCALATED — CONTRADICTION";
    status = "escalated";
    const esc = computeEscalation({
      intent: routed.intent,
      caseComplexity: 0.7,
      repeatContacts,
      sentiment: routed.sentiment,
      financialImpact: duplicateAmount ?? 0,
      policyUncertainty: false,
      conflictingEvidence: true,
      aiConfidence: confidence,
      actionFailures: 0,
      slaRisk: false,
    });
    escalationScore = esc.score;
    await recordEscalation(db, caseUuid, esc, contradictions, {
      caseId, customer: cust, message: req.message, intent: routed.intent,
      evidence, hypotheses, rootCause, rootConfidence, gates, recommendedAction,
      tickets, orders, payments, sentiment: routed.sentiment, urgency: routed.urgency,
      conversation: null,
    });
    status = "escalated";
  }
  // ---- Track A: autonomous resolution ----
  else if (
    gates.canAutoResolve &&
    confidence >= MIN_AUTO_CONFIDENCE &&
    recommendedAction.action === "issue_refund" &&
    duplicateTarget
  ) {
    status = "verifying";
    await emitCaseEvent(db, caseUuid, "action", "Action — issue_refund", "running", {
      attempt: 1,
      payment_txn: duplicateTarget.txn_id,
      amount: duplicateAmount,
    });
    await updateCase(db, caseUuid, { status: "action_required" });

    let outcome: { status: string; overall: string; detail: string; refundId?: string } | null = null;
    const attempts: Record<string, unknown>[] = [];
    const actionId = await recordAgentAction(
      db, caseUuid, routed.specialist, "issue_refund", "executing",
      { payment_txn: duplicateTarget.txn_id, amount: duplicateAmount }, {},
    );

    for (let attempt = 1; attempt <= 3 && !outcome; attempt++) {
      const res = await executeRefund(db, {
        caseUuid,
        caseId,
        customerId: req.customerId,
        paymentUuid: String(duplicateTarget.id),
        amount: duplicateAmount!,
        agentKey: routed.specialist,
      });
      const record: Record<string, unknown> = {
        attempt,
        status: res.action.status,
        error: res.action.error ?? null,
        detail: res.action.detail,
      };
      attempts.push(record);
      await recordAgentAction(
        db, caseUuid, routed.specialist, "issue_refund",
        res.action.status === "succeeded" ? "succeeded" : "failed",
        { attempt, payment_txn: duplicateTarget.txn_id },
        { detail: res.action.detail },
        res.action.error,
      );
      await recordVerification(db, actionId, caseUuid, res.verification);

      if (res.action.status === "succeeded") {
        outcome = {
          status: "resolved",
          overall: res.verification.overall,
          detail: res.action.detail,
          refundId: res.action.output.refund_id as string,
        };
        verification = res.verification;
        break;
      }
      if (res.verification.overall === "failed" && res.action.status === "blocked") {
        // Refund created but not verifiable → do NOT claim success.
        outcome = {
          status: "verification_failed",
          overall: "failed",
          detail: res.verification.detail,
          refundId: res.action.output.refund_id as string,
        };
        verification = res.verification;
        break;
      }
      // Execution failure → retry (circuit breaker will stop the loop)
      await emitCaseEvent(db, caseUuid, "action", `Action — issue_refund (attempt ${attempt} failed)`, "warn", {
        attempt,
        error: res.action.error,
      });
      await sleep(req.fast ? 0 : ACTION_DELAY);
    }

    if (outcome?.status === "resolved") {
      await emitCaseEvent(db, caseUuid, "action", "Action — issue_refund", "ok", {
        status: "succeeded",
        refund_id: outcome.refundId,
      });
      await sleep(req.fast ? 0 : 250);
      // Verification event
      await emitCaseEvent(db, caseUuid, "verification", "Verification", "ok", {
        overall: verification?.overall ?? "passed",
        checks: verification?.checks ?? [],
      });
      await updateCase(db, caseUuid, {
        verification_result: verification ?? {},
        action_history: attempts,
        status: "resolved",
        resolution_status: "RESOLVED — refund issued & verified",
        closed_at: new Date().toISOString(),
      });
      resolutionStatus = "RESOLVED";
      status = "resolved";
      await emitAnalytics(db, req.customerId, caseUuid, "case_resolved", {
        intent: routed.intent,
        action: "issue_refund",
      });
      await recordIncidentAndAudit(db, caseUuid, symptoms, rootCause, {
        actor, agent: routed.specialist, action: "issue_refund",
        decision: { gates: "PASS", confidence }, policy: { policy_id: policyEval.policyId },
        authority: gates.gates.authority, risk: gates.gates.risk,
        result: { refund_id: outcome.refundId, status: "issued" },
        verification,
      });
    } else {
      // ---- Track C: circuit breaker ----
      const breaker = {
        tripped: (attempts.filter((a) => a.status === "failed").length) >= 3,
        attempts: attempts.length,
        limit: 3,
      };
      await updateCase(db, caseUuid, {
        action_history: attempts,
        circuit_breaker: breaker,
        verification_result: verification ?? { overall: "unknown", checks: [] },
      });
      if (breaker.tripped) {
        await emitCaseEvent(db, caseUuid, "circuit_breaker", "Circuit Breaker", "error", {
          reason: "Repeated action failure — automation paused",
          attempts,
        });
        await emitCaseEvent(db, caseUuid, "action", "Action — issue_refund", "error", {
          error: "refund_api_unavailable",
        });
        status = "automation_paused";
        resolutionStatus = "ESCALATED — AUTOMATION PAUSED (CIRCUIT BREAKER)";
        const esc = computeEscalation({
          intent: routed.intent,
          caseComplexity: 0.6,
          repeatContacts,
          sentiment: routed.sentiment,
          financialImpact: duplicateAmount ?? 0,
          policyUncertainty: false,
          conflictingEvidence: false,
          aiConfidence: confidence,
          actionFailures: attempts.filter((a) => a.status === "failed").length,
          slaRisk: false,
        });
        escalationScore = esc.score;
        await recordEscalation(db, caseUuid, esc, [], {
          caseId, customer: cust, message: req.message, intent: routed.intent,
          evidence, hypotheses, rootCause, rootConfidence, gates, recommendedAction,
          tickets, orders, payments, sentiment: routed.sentiment, urgency: routed.urgency,
          conversation: null,
          circuitBreaker: breaker,
        });
        status = "escalated";
      } else {
        // Verification failed without breaker trip
        await emitCaseEvent(db, caseUuid, "verification", "Verification", "error", {
          overall: "failed",
          detail: outcome?.detail ?? "Action result could not be verified",
        });
        resolutionStatus = "VERIFICATION FAILED — ESCALATED";
        status = "escalated";
        const esc = computeEscalation({
          intent: routed.intent, caseComplexity: 0.6, repeatContacts,
          sentiment: routed.sentiment, financialImpact: duplicateAmount ?? 0,
          policyUncertainty: false, conflictingEvidence: false, aiConfidence: confidence,
          actionFailures: 1, slaRisk: false,
        });
        escalationScore = esc.score;
        await recordEscalation(db, caseUuid, esc, [], {
          caseId, customer: cust, message: req.message, intent: routed.intent,
          evidence, hypotheses, rootCause, rootConfidence, gates, recommendedAction,
          tickets, orders, payments, sentiment: routed.sentiment, urgency: routed.urgency,
          conversation: null,
        });
        status = "escalated";
      }
      await emitAnalytics(db, req.customerId, caseUuid, "action_failed", {
        intent: routed.intent, action: "issue_refund",
      });
    }
  }
  // ---- Low confidence / no permitted action → evaluate escalation ----
  else {
    const esc = computeEscalation({
      intent: routed.intent,
      caseComplexity: 0.5,
      repeatContacts,
      sentiment: routed.sentiment,
      financialImpact: duplicateAmount ?? 0,
      policyUncertainty: !policyEval.allowed,
      conflictingEvidence: false,
      aiConfidence: confidence,
      actionFailures: 0,
      slaRisk: routed.priority === "P1",
    });
    if (esc.score >= 55 || !gates.canAutoResolve) {
      escalationScore = esc.score;
      resolutionStatus = `ESCALATED — ${confidence < MIN_AUTO_CONFIDENCE ? "LOW CONFIDENCE" : "GATE NOT PASSED"}`;
      status = "escalated";
      await recordEscalation(db, caseUuid, esc, [], {
        caseId, customer: cust, message: req.message, intent: routed.intent,
        evidence, hypotheses, rootCause, rootConfidence, gates, recommendedAction,
        tickets, orders, payments, sentiment: routed.sentiment, urgency: routed.urgency,
        conversation: null,
      });
    } else {
      status = "action_required";
      resolutionStatus = "AWAITING SPECIALIST ACTION";
      await updateCase(db, caseUuid, { status: "action_required", resolution_status: resolutionStatus });
    }
  }

  // -----------------------------------------------------------------
  // 9. Customer-facing response
  // -----------------------------------------------------------------
  const respContext = [
    `Customer: ${cust.name}`,
    `Intent: ${routed.intent}`,
    `Root cause: ${rootCause ?? "not determined"}`,
    status === "resolved" ? "Action: refund issued and verified." : "",
    status === "escalated" ? "Action: escalated to human support team." : "",
    verification?.overall === "passed" ? `Verified: ${outcomeRefundLine(verification)}` : "",
  ].filter(Boolean).join("\n");
  const llmReply = await llmRespond(String(cust.name), respContext);
  response = llmReply || fallbackResponse(status === "resolved", {
    customerName: String(cust.name),
    intent: routed.intent,
    rootCause,
    contradiction: contradictions.length > 0,
    refundIssued: status === "resolved",
    escalated: status === "escalated" || status === "automation_paused",
  });
  await executeSendMessage(db, {
    conversationUuid: convoUuid,
    content: response,
    agentKey: "supervisor",
  });

  // -----------------------------------------------------------------
  // 10. Finalize Case Twin
  // -----------------------------------------------------------------
  const finalPatch: Record<string, unknown> = {
    status,
    resolution_status: resolutionStatus,
    escalation_score: escalationScore,
    escalation_reasons: escalationScore != null
      ? (await lastEscalationReasons(db, caseUuid))
      : [],
    verification_result: verification ?? {},
    recommended_action: recommendedAction,
    agent_notes: `Handled by ${routed.specialist} agent; response sent to customer.`,
  };
  await updateCase(db, caseUuid, finalPatch);

  if (status === "escalated") {
    await emitAnalytics(db, req.customerId, caseUuid, "case_escalated", {
      intent: routed.intent, score: escalationScore,
    });
  }
  await emitCaseEvent(db, caseUuid, "resolution", status === "resolved" ? "Case Resolved" : "Escalation", status === "resolved" ? "ok" : "warn", {
    status, resolution_status: resolutionStatus,
  });

  // Incident detection
  await detectAndRecordIncident(db, caseUuid, symptoms, rootCause);
  await emitAnalytics(db, req.customerId, caseUuid, "case_opened", {
    intent: routed.intent, priority: routed.priority,
  });

  const { data: finalCase } = await db.from("resolveai_cases").select("*").eq("id", caseUuid).single();
  return {
    caseUuid,
    caseId,
    response,
    status,
    resolutionStatus,
    intent: routed.intent,
    specialist: routed.specialist,
    escalationScore,
    snapshot: finalCase as Record<string, unknown>,
  };
}

function outcomeRefundLine(verification: { overall: string; checks: unknown[] } | null): string {
  const checks = (verification?.checks ?? []) as { name: string; actual: unknown }[];
  const refund = checks.find((c) => c.name === "refund_record_exists");
  const amount = checks.find((c) => c.name === "refund_amount_matches");
  return `refund ${refund?.actual ? "exists" : "unknown"}, amount ${String(amount?.actual ?? "unknown")}`;
}

async function lastEscalationReasons(db: SupabaseClient, caseUuid: string): Promise<unknown[]> {
  const { data } = await db.from("resolveai_escalations").select("reasons").eq("case_id", caseUuid).order("created_at", { ascending: false }).limit(1);
  return data && data.length > 0 ? ((data[0] as { reasons: unknown[] }).reasons ?? []) : [];
}

async function recordEscalation(
  db: SupabaseClient,
  caseUuid: string,
  esc: { score: number; reasons: string[]; recommendedQueue: string; priority: string },
  contradictions: Contradiction[],
  data: {
    caseId: string; customer: Record<string, unknown>; message: string; intent: string;
    evidence: EvidenceItem[]; hypotheses: Hypothesis[]; rootCause: string | null;
    rootConfidence: number | null; gates: Record<string, unknown>;
    recommendedAction: Record<string, unknown>;
    tickets: unknown[] | null; orders: unknown[] | null; payments: unknown[] | null;
    sentiment: string; urgency: string; conversation: unknown;
    circuitBreaker?: Record<string, unknown>;
  },
): Promise<void> {
  const passport = {
    case_id: data.caseId,
    customer_profile: {
      name: data.customer.name, tier: data.customer.tier,
      customer_code: data.customer.customer_code, lifetime_value: data.customer.lifetime_value,
    },
    original_complaint: data.message,
    conversation_summary: data.message,
    understanding: { intent: data.intent, urgency: data.urgency, sentiment: data.sentiment },
    orders: (data.orders ?? []).map((o) => (o as Record<string, unknown>).order_id),
    transactions: (data.payments ?? []).map((p) => (p as Record<string, unknown>).txn_id),
    ticket_history: (data.tickets ?? []).map((t) => (t as Record<string, unknown>).ticket_id),
    evidence: data.evidence,
    hypotheses: data.hypotheses,
    root_cause: data.rootCause,
    root_cause_confidence: data.rootConfidence,
    contradictions,
    four_gates: data.gates,
    actions_attempted: [],
    circuit_breaker: data.circuitBreaker ?? null,
    escalation_score: esc.score,
    escalation_reason: esc.reasons,
    recommended_next_action: data.recommendedAction,
  };
  await db.from("resolveai_escalations").insert({
    case_id: caseUuid,
    score: esc.score,
    reasons: esc.reasons,
    recommended_queue: esc.recommendedQueue,
    priority: esc.priority,
    passport,
    status: "open",
  });
  await updateCase(db, caseUuid, {
    status: "escalated",
    escalation_score: esc.score,
    escalation_reasons: esc.reasons,
    resolution_status: "ESCALATED",
    resolution_passport: passport,
  });
  await emitAudit(db, caseUuid, "system", "supervisor", "escalate_case", {
    input: { score: esc.score },
    decision: { escalated: true, recommended_queue: esc.recommendedQueue },
    result: { passport_generated: true },
  });
}

async function recordIncidentAndAudit(
  db: SupabaseClient,
  caseUuid: string,
  symptoms: string[],
  rootCause: string | null,
  audit: Record<string, unknown>,
): Promise<void> {
  await emitAudit(db, caseUuid, String(audit.actor), String(audit.agent), String(audit.action), {
    input: audit.input as Record<string, unknown> | undefined,
    decision: audit.decision as Record<string, unknown> | undefined,
    policy: audit.policy as Record<string, unknown> | undefined,
    authority: audit.authority as Record<string, unknown> | undefined,
    risk: audit.risk as Record<string, unknown> | undefined,
    result: audit.result as Record<string, unknown> | undefined,
    verification: audit.verification as Record<string, unknown> | undefined,
  });
}
