// =====================================================================
// ResolveAI engine — Four-Gate Controller (Evidence / Policy / Authority / Risk)
// Deterministic. The LLM proposes; these gates decide whether execution
// is permitted.
// =====================================================================
import { AUTHORITY_LIMITS } from "./types.ts";
import type { EvidenceItem, GateResult } from "./types.ts";

export interface GateInputs {
  evidence: EvidenceItem[];
  action: string;
  amount: number | null;
  customerTier: string;
  staffRole?: string | null;
  policyAllowed: boolean;
  policyId?: string | null;
  contradictions: number;
  repeatContacts: number;
  sentiment: string;
  uncertainty: number; // 0..1 (evidence gaps)
  highValueCustomer: boolean;
  hasDuplicates: boolean;
  actionFailures: number;
}

export function evaluateEvidenceGate(
  inputs: Pick<GateInputs, "evidence" | "uncertainty" | "hasDuplicates">,
): GateResult {
  const sourceCount = new Set(inputs.evidence.map((e) => e.source)).size;
  const factCount = inputs.evidence.filter((e) => e.known).length;
  const checks = [
    {
      name: "factual_evidence",
      pass: factCount >= 2,
      detail: `${factCount} factual evidence item(s) collected`,
    },
    {
      name: "independent_sources",
      pass: sourceCount >= 2,
      detail: `${sourceCount} independent source(s)`,
    },
    {
      name: "uncertainty_bounded",
      pass: inputs.uncertainty <= 0.4,
      detail: `uncertainty ${Math.round(inputs.uncertainty * 100)}%`,
    },
  ];
  const pass = checks.every((c) => c.pass);
  return {
    name: "GATE-1 Evidence",
    status: pass ? "PASS" : "FAIL",
    detail: pass
      ? "Sufficient factual evidence from independent sources."
      : "Insufficient evidence to support autonomous action.",
    checks,
  };
}

export function evaluatePolicyGate(
  inputs: Pick<GateInputs, "policyAllowed" | "policyId" | "action" | "contradictions">,
): GateResult {
  const checks = [
    {
      name: "action_permitted_by_policy",
      pass: inputs.policyAllowed,
      detail: `policy ${inputs.policyId ?? "none"} ${inputs.policyAllowed ? "permits" : "does not permit"} '${inputs.action}'`,
    },
    {
      name: "no_policy_violation",
      pass: inputs.contradictions === 0,
      detail:
        inputs.contradictions > 0
          ? `${inputs.contradictions} contradiction(s) detected — policy blocks auto-resolution`
          : "no contradictory evidence",
    },
  ];
  const pass = checks.every((c) => c.pass);
  return {
    name: "GATE-2 Policy",
    status: pass ? "PASS" : "FAIL",
    detail: pass
      ? "Company policy permits this action."
      : "Action is not permitted by applicable policy.",
    checks,
  };
}

export function evaluateAuthorityGate(
  inputs: Pick<GateInputs, "action" | "amount" | "customerTier" | "staffRole">,
): GateResult {
  const isMonetary = inputs.action === "issue_refund" || inputs.action === "cancel_order";
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  if (!isMonetary || inputs.amount == null) {
    checks.push({
      name: "monetary_authority",
      pass: true,
      detail: "action requires no monetary authority",
    });
  } else {
    const actor = inputs.staffRole ?? inputs.customerTier;
    const limit = AUTHORITY_LIMITS[actor] ?? AUTHORITY_LIMITS.standard;
    const within = inputs.amount <= limit;
    checks.push({
      name: "amount_within_authority",
      pass: within,
      detail: `₹${inputs.amount} vs authority limit ₹${limit} for '${actor}'`,
    });
    checks.push({
      name: "actor_authorized",
      pass: Boolean(actor),
      detail: `acting authority: ${actor ?? "none"}`,
    });
  }

  const pass = checks.every((c) => c.pass);
  return {
    name: "GATE-3 Authority",
    status: pass ? "PASS" : "FAIL",
    detail: pass ? "Action is within the current authority limits." : "Action exceeds the current authority limit.",
    checks,
  };
}

export function evaluateRiskGate(
  inputs: Pick<
    GateInputs,
    | "amount"
    | "contradictions"
    | "repeatContacts"
    | "sentiment"
    | "uncertainty"
    | "highValueCustomer"
    | "actionFailures"
  >,
): GateResult {
  let score = 0;
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  const fraudRisk = inputs.contradictions > 0 ? 0.85 : 0.05;
  checks.push({
    name: "fraud_risk",
    pass: fraudRisk < 0.5,
    detail: `fraud risk ${Math.round(fraudRisk * 100)}% (${inputs.contradictions > 0 ? "contradictory evidence" : "no signals"})`,
  });
  score += fraudRisk * 0.3;

  const financialRisk = inputs.amount ? Math.min(0.8, inputs.amount / 50000) : 0;
  checks.push({
    name: "financial_risk",
    pass: financialRisk < 0.5,
    detail: `financial exposure ₹${inputs.amount ?? 0}`,
  });
  score += financialRisk * 0.25;

  const customerRisk = Math.min(1, inputs.repeatContacts / 5) * 0.4 +
    (inputs.sentiment === "negative" ? 0.25 : 0);
  checks.push({
    name: "customer_risk",
    pass: customerRisk < 0.5,
    detail: `repeat contacts ${inputs.repeatContacts}, sentiment ${inputs.sentiment}`,
  });
  score += customerRisk * 0.2;

  checks.push({
    name: "uncertainty",
    pass: inputs.uncertainty <= 0.4,
    detail: `uncertainty ${Math.round(inputs.uncertainty * 100)}%`,
  });
  score += inputs.uncertainty * 0.15;

  const actionFailRisk = Math.min(1, inputs.actionFailures / 3);
  checks.push({
    name: "action_reliability",
    pass: actionFailRisk < 0.9,
    detail: `${inputs.actionFailures} prior action failure(s)`,
  });
  score += actionFailRisk * 0.1;

  score = Number(score.toFixed(2));
  const status = score >= 0.7 ? "BLOCK" : score >= 0.4 ? "REVIEW" : "PASS";
  return {
    name: "GATE-4 Risk",
    status,
    detail:
      status === "PASS"
        ? "Risk within acceptable bounds."
        : status === "REVIEW"
          ? "Elevated risk — human review required."
          : "High risk — action blocked.",
    checks,
  };
}

export interface FourGateSummary {
  gates: Record<string, GateResult>;
  allPass: boolean;
  canAutoResolve: boolean;
}

export function evaluateAllGates(inputs: GateInputs): FourGateSummary {
  const evidence = evaluateEvidenceGate(inputs);
  const policy = evaluatePolicyGate(inputs);
  const authority = evaluateAuthorityGate(inputs);
  const risk = evaluateRiskGate(inputs);

  const gates: Record<string, GateResult> = {
    evidence,
    policy,
    authority,
    risk,
  };
  const allPass = Object.values(gates).every((g) => g.status === "PASS");
  return { gates, allPass, canAutoResolve: allPass };
}
