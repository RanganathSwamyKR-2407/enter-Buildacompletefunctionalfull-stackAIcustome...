// =====================================================================
// ResolveAI engine — uncertainty / low-confidence assessment (pure TS)
// Never presents uncertain hypotheses as confirmed facts.
// =====================================================================
export interface UncertaintyInputs {
  aiConfidence: number | null; // 0..1 routing/root-cause confidence
  evidenceCount: number;
  expectedEvidence: number; // ideal evidence items for this intent
  contradictions: number;
  policyCertain: boolean;
  actionRisk: "low" | "medium" | "high";
}

export interface UncertaintyResult {
  level: "LOW" | "MODERATE" | "HIGH";
  confidence: number | null;
  evidenceCompleteness: number; // 0..1
  evidenceConsistency: "consistent" | "conflicting" | "missing";
  policyCertainty: "certain" | "uncertain";
  actionRisk: "low" | "medium" | "high";
  missingEvidence: string[];
  blockAutoResolution: boolean;
  recommendHumanReview: boolean;
  reason: string;
}

export function assessUncertainty(inputs: UncertaintyInputs): UncertaintyResult {
  const evidenceCompleteness = Math.min(1, inputs.evidenceCount / Math.max(1, inputs.expectedEvidence));
  const consistency: UncertaintyResult["evidenceConsistency"] =
    inputs.contradictions > 0 ? "conflicting" : inputs.evidenceCount === 0 ? "missing" : "consistent";

  let level: UncertaintyResult["level"] = "LOW";
  const reasons: string[] = [];

  if (inputs.aiConfidence != null && inputs.aiConfidence < 0.6) {
    level = "HIGH";
    reasons.push(`AI confidence ${Math.round(inputs.aiConfidence * 100)}% is below the safe threshold (60%).`);
  } else if (inputs.aiConfidence != null && inputs.aiConfidence < 0.7) {
    level = "MODERATE";
    reasons.push(`AI confidence ${Math.round(inputs.aiConfidence * 100)}% is moderate.`);
  }

  if (evidenceCompleteness < 0.5) {
    if (level !== "HIGH") level = "MODERATE";
    reasons.push(`Evidence incomplete (${inputs.evidenceCount} of ${inputs.expectedEvidence} expected items).`);
  }

  if (consistency === "conflicting") {
    level = "HIGH";
    reasons.push(`${inputs.contradictions} contradictory finding(s) detected.`);
  }

  if (!inputs.policyCertain) {
    if (level !== "HIGH") level = "MODERATE";
    reasons.push("Policy applicability is uncertain.");
  }

  if (inputs.actionRisk === "high") {
    level = "HIGH";
    reasons.push("High-risk action involved.");
  }

  const blockAutoResolution = level === "HIGH" || consistency === "conflicting";
  const missingEvidence: string[] = [];
  if (evidenceCompleteness < 1) {
    if (!inputs.policyCertain) missingEvidence.push("A policy that clearly permits the proposed action");
    if (inputs.contradictions > 0) missingEvidence.push("Evidence that reconciles the contradiction");
    if (evidenceCompleteness < 0.5) missingEvidence.push(`Additional factual evidence (${Math.ceil(inputs.expectedEvidence - inputs.evidenceCount)} items)`);
  }

  return {
    level,
    confidence: inputs.aiConfidence,
    evidenceCompleteness: Math.round(evidenceCompleteness * 100) / 100,
    evidenceConsistency: consistency,
    policyCertainty: inputs.policyCertain ? "certain" : "uncertain",
    actionRisk: inputs.actionRisk,
    missingEvidence,
    blockAutoResolution,
    recommendHumanReview: blockAutoResolution || level === "MODERATE",
    reason: reasons.length > 0 ? reasons.join(" ") : "Evidence is sufficient and consistent; confidence is acceptable.",
  };
}
