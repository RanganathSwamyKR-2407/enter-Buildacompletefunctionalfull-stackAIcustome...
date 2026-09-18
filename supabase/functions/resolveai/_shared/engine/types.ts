// =====================================================================
// ResolveAI engine — shared types (pure TS, no external imports)
// Used by both backend functions (Deno) and frontend tests (Vitest).
// =====================================================================

export type IntentKey = "billing" | "order" | "technical" | "account";

export type GateStatus = "PASS" | "FAIL" | "REVIEW" | "BLOCK";

export interface Understanding {
  intent: string;
  subIntents: string[];
  urgency: "low" | "medium" | "high";
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number; // 0 (negative) .. 1 (positive)
  priority: string; // P1..P4
  confidence: number; // 0..1
  specialist: string;
  routingReason: string;
}

export interface EvidenceItem {
  id: string;
  source: string; // customers|orders|payments|tickets|knowledge|policy
  type: string;
  label: string;
  value: unknown;
  known: boolean; // true = fact read from a data source, false = inference
  detail?: string;
}

export interface GateCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface GateResult {
  name: string;
  status: GateStatus;
  detail: string;
  checks: GateCheck[];
}

export interface Contradiction {
  id: string;
  type: string;
  label: string;
  evidence: { source: string; value: string }[];
  decision: "AUTO-RESOLUTION BLOCKED";
  impact?: string;
  requiredAction?: string;
}

export interface EscalationResult {
  score: number;
  reasons: string[];
  recommendedQueue: string;
  priority: string;
}

export interface Hypothesis {
  title: string;
  reasoning: string;
  confidence: number; // 0..1
  evidenceIds: string[];
}

export interface PolicyRow {
  policy_id: string;
  name: string;
  category: string;
  description: string;
  conditions: Record<string, unknown>;
  allowed_actions: string[];
  restrictions: string[];
  authority_limits: Record<string, number>;
}

export interface ActionResult {
  action: string;
  status: "succeeded" | "failed" | "blocked";
  detail: string;
  output: Record<string, unknown>;
  error?: string;
}

export interface VerificationResult {
  overall: "passed" | "failed" | "unknown";
  checks: { name: string; expected: unknown; actual: unknown; pass: boolean }[];
  detail: string;
}

export interface CaseContext {
  caseId: string; // human id CS-xxxx
  customer: {
    id: string;
    name: string;
    tier: string;
    lifetimeValue: number;
    churnRisk: number;
    repeatContacts: number;
    priorRefunds: number;
  };
  orderIds: string[];
  transactionIds: string[];
  ticketIds: string[];
  message: string;
  intent: string;
  subIntents: string[];
  urgency: string;
  sentiment: string;
  priority: string;
  specialist: string;
  routingReason: string;
  routingConfidence: number;
  evidence: EvidenceItem[];
  hypotheses: Hypothesis[];
  rootCause: string | null;
  rootCauseConfidence: number | null;
  contradictions: Contradiction[];
  gates: Record<string, GateResult>;
  policy: Record<string, unknown>;
  authority: Record<string, unknown>;
  risk: Record<string, unknown>;
  actionHistory: Record<string, unknown>[];
  recommendedAction: Record<string, unknown>;
  escalation: EscalationResult | null;
  verification: VerificationResult | null;
  resolved: boolean;
  resolutionStatus: string | null;
  passport: Record<string, unknown>;
}

export const AUTHORITY_LIMITS: Record<string, number> = {
  // Automated authority by customer tier (spec: Tier-1 ₹1000, Tier-2 ₹5000, Manager > ₹5000)
  standard: 1000,
  premium: 5000,
  gold: 15000,
  // Staff role authority for manual actions
  customer_support_t1: 1000,
  customer_support_t2: 5000,
  manager: 50000,
  admin: 50000,
};

export const SLA_HOURS: Record<string, number> = {
  P1: 6,
  P2: 12,
  P3: 24,
  P4: 48,
};

export const SPECIALIST_BY_INTENT: Record<string, string> = {
  billing: "billing",
  order: "order",
  technical: "technical",
  account: "account",
};
