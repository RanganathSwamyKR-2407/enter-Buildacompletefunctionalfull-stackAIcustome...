// =====================================================================
// ResolveAI engine — escalation scoring
// Pure TS. Computes escalation_score + reasons + recommended queue.
// =====================================================================
import type { EscalationResult } from "./types.ts";

export interface EscalationInputs {
  intent: string;
  caseComplexity: number; // 0..1
  repeatContacts: number;
  sentiment: string;
  financialImpact: number; // ₹
  policyUncertainty: boolean;
  conflictingEvidence: boolean;
  aiConfidence: number; // 0..1
  actionFailures: number;
  slaRisk: boolean; // SLA deadline at risk
}

const QUEUE_BY_INTENT: Record<string, string> = {
  billing: "Tier-2 Billing Investigations",
  order: "Tier-2 Order Investigations",
  technical: "Technical Support Team",
  account: "Account Review",
};

export function computeEscalation(
  inputs: EscalationInputs,
  confidenceFloor = 0.6,
): EscalationResult {
  let score = 0;
  const reasons: string[] = [];

  if (inputs.repeatContacts >= 2) {
    score += 15;
    reasons.push(`${inputs.repeatContacts} previous contacts for the same issue`);
  } else if (inputs.repeatContacts === 1) {
    score += 6;
  }

  if (inputs.conflictingEvidence) {
    score += 20;
    reasons.push("Contradictory evidence detected");
  }

  if (inputs.actionFailures >= 3) {
    score += 20;
    reasons.push("Automated action failed repeatedly");
  } else if (inputs.actionFailures > 0) {
    score += inputs.actionFailures * 5;
    reasons.push(`${inputs.actionFailures} failed automated action(s)`);
  }

  if (inputs.aiConfidence < confidenceFloor) {
    score += 15;
    reasons.push(`AI confidence below safe threshold (${Math.round(inputs.aiConfidence * 100)}%)`);
  }

  if (inputs.policyUncertainty) {
    score += 10;
    reasons.push("Policy uncertainty");
  }

  const financialWeight = Math.min(15, (inputs.financialImpact / 5000) * 8);
  score += financialWeight;
  if (inputs.financialImpact > 5000) reasons.push(`High financial impact (₹${inputs.financialImpact})`);

  if (inputs.sentiment === "negative") {
    score += 6;
    reasons.push("Customer frustration (negative sentiment)");
  }

  if (inputs.caseComplexity > 0.6) {
    score += 8;
    reasons.push("High case complexity");
  }

  if (inputs.slaRisk) {
    score += 5;
    reasons.push("SLA deadline at risk");
  }

  score = Math.min(100, Math.round(score));
  if (score === 0) reasons.push("No escalation triggers detected");

  return {
    score,
    reasons: [...new Set(reasons)].slice(0, 6),
    recommendedQueue: QUEUE_BY_INTENT[inputs.intent] ?? "General Support",
    priority: score >= 80 ? "P1" : score >= 55 ? "P2" : "P3",
  };
}
