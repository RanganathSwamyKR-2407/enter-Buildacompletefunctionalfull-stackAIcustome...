// =====================================================================
// ResolveAI engine — Resolution Passport builder
// Pure TS. Assembles the complete context handed to a human agent.
// =====================================================================
import type { CaseContext } from "./types.ts";

export function buildPassport(ctx: CaseContext): Record<string, unknown> {
  return {
    case_id: ctx.caseId,
    generated_at: new Date().toISOString(),
    customer: ctx.customer,
    original_complaint: ctx.message,
    understanding: {
      intent: ctx.intent,
      sub_intents: ctx.subIntents,
      urgency: ctx.urgency,
      sentiment: ctx.sentiment,
      confidence: ctx.routingConfidence,
      specialist: ctx.specialist,
      routing_reason: ctx.routingReason,
    },
    context: {
      orders: ctx.orderIds,
      transactions: ctx.transactionIds,
      prior_tickets: ctx.ticketIds,
      repeat_contacts: ctx.customer.repeatContacts,
      prior_refunds: ctx.customer.priorRefunds,
    },
    evidence: ctx.evidence,
    hypotheses: ctx.hypotheses,
    root_cause: ctx.rootCause,
    root_cause_confidence: ctx.rootCauseConfidence,
    contradictions: ctx.contradictions,
    four_gates: ctx.gates,
    policy: ctx.policy,
    authority: ctx.authority,
    risk: ctx.risk,
    actions_attempted: ctx.actionHistory,
    verification: ctx.verification,
    escalation: ctx.escalation,
    resolution_status: ctx.resolutionStatus,
    recommended_next_action: ctx.recommendedAction,
    know_vs_infer_vs_decide: {
      known: ctx.evidence.filter((e) => e.known).map((e) => ({ source: e.source, label: e.label })),
      inferred: ctx.evidence
        .filter((e) => !e.known)
        .map((e) => ({ source: e.source, label: e.label, detail: e.detail })),
      decided: {
        decision: ctx.resolved ? "AUTONOMOUSLY RESOLVED" : ctx.escalation ? "ESCALATED TO HUMAN" : "AWAITING ACTION",
        why: "Evidence + policy + authority + acceptable risk evaluated by deterministic four-gate controller",
      },
    },
  };
}
