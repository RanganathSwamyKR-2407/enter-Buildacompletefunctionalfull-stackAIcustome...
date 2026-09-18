// ResolveAI — re-export the deterministic engine so the browser can run the
// real Four-Gate controller, effort scoring, uncertainty assessment and trend
// detection on real data. These are the same pure modules the backend uses.
export { evaluateAllGates, evaluateAuthorityGate, evaluateEvidenceGate, evaluatePolicyGate, evaluateRiskGate } from "../../supabase/functions/resolveai/_shared/engine/gates";
export type { GateInputs } from "../../supabase/functions/resolveai/_shared/engine/gates";
export { AUTHORITY_LIMITS, SLA_HOURS } from "../../supabase/functions/resolveai/_shared/engine/types";
export type { GateResult } from "../../supabase/functions/resolveai/_shared/engine/types";
export { evaluatePolicy } from "../../supabase/functions/resolveai/_shared/engine/policy";
export { computeCustomerEffort } from "../../supabase/functions/resolveai/_shared/engine/effort";
export type { EffortInputs, EffortResult } from "../../supabase/functions/resolveai/_shared/engine/effort";
export { assessUncertainty } from "../../supabase/functions/resolveai/_shared/engine/uncertainty";
export type { UncertaintyInputs, UncertaintyResult } from "../../supabase/functions/resolveai/_shared/engine/uncertainty";
export { computeTrend } from "../../supabase/functions/resolveai/_shared/engine/trends";
export type { TrendInputs, TrendResult } from "../../supabase/functions/resolveai/_shared/engine/trends";
