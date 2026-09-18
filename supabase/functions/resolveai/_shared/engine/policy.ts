// =====================================================================
// ResolveAI engine — deterministic policy evaluation
// The LLM never invents policy: every decision reads policy rows and
// evaluates their conditions against collected facts.
// =====================================================================
import type { PolicyRow } from "./types.ts";

export interface PolicyFacts {
  twoSuccessfulPaymentsSameOrder: boolean;
  amount: number;
  orderPending: boolean;
  within30Days: boolean;
  deliveryEvidenceComplete: boolean;
  noContradiction: boolean;
  identityVerified: boolean;
  defectConfirmed: boolean;
  fraudRisk: string;
}

export interface PolicyEvaluation {
  policyId: string | null;
  policyName: string | null;
  allowed: boolean;
  matchedConditions: { condition: string; satisfied: boolean }[];
  reason: string;
}

const FACT_KEYS: Record<string, keyof PolicyFacts> = {
  two_successful_payments_same_order: "twoSuccessfulPaymentsSameOrder",
  amount_within_authority: "amountWithinAuthority",
  within_30_days: "within30Days",
  order_pending: "orderPending",
  delivery_evidence_complete: "deliveryEvidenceComplete",
  no_contradiction: "noContradiction",
  identity_verified: "identityVerified",
  defect_confirmed: "defectConfirmed",
  fraud_risk: "fraudRisk",
};

export function evaluatePolicy(
  policies: PolicyRow[],
  action: string,
  facts: PolicyFacts,
): PolicyEvaluation {
  // Prefer policies that explicitly allow this action; evaluate conditions.
  const relevant = policies.filter((p) => p.allowed_actions.includes(action));
  if (relevant.length === 0) {
    return {
      policyId: null,
      policyName: null,
      allowed: false,
      matchedConditions: [],
      reason: `No policy permits action '${action}'`,
    };
  }

  let best: PolicyEvaluation | null = null;
  for (const policy of relevant) {
    const matchedConditions: { condition: string; satisfied: boolean }[] = [];
    let allTrue = true;
    for (const [key, expected] of Object.entries(policy.conditions)) {
      const factKey = FACT_KEYS[key];
      let satisfied: boolean;
      if (key === "amount_within_authority") {
        satisfied = facts.amountWithinAuthority;
      } else if (factKey) {
        satisfied = facts[factKey] === expected;
      } else {
        satisfied = true;
      }
      if (!satisfied) allTrue = false;
      matchedConditions.push({ condition: key, satisfied });
    }

    // If the policy has no conditions, its only requirement is that the
    // action is in allowed_actions (already satisfied by the filter).
    if (Object.keys(policy.conditions).length === 0) allTrue = true;

    const allowed = allTrue;
    if (allowed || !best) {
      best = {
        policyId: policy.policy_id,
        policyName: policy.name,
        allowed,
        matchedConditions,
        reason: allowed
          ? `Policy ${policy.policy_id} (${policy.name}) permits '${action}'`
          : `Policy ${policy.policy_id} (${policy.name}) conditions not met for '${action}'`,
      };
    }
  }

  return best!;
}
