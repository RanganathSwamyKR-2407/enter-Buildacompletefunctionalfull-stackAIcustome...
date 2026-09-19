// ResolveAI — shared frontend types (mirror of the Enter Cloud schema)

export interface Customer {
  id: string;
  user_id: string | null;
  customer_code: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  tier: "standard" | "premium" | "gold";
  lifetime_value: number;
  orders_count: number;
  refunds_count: number;
  churn_risk: number;
  sentiment_history: unknown[];
  created_at: string;
}

export interface CaseRow {
  id: string;
  case_id: string;
  customer_id: string;
  conversation_id: string | null;
  message_text: string | null;
  intent: string | null;
  sub_intents: string[];
  urgency: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  priority: string | null;
  status: string;
  specialist: string | null;
  routing_reason: string | null;
  routing_confidence: number | null;
  sla_deadline: string | null;
  customer_history: Record<string, unknown>;
  order_ids: string[];
  transaction_ids: string[];
  ticket_ids: string[];
  evidence: EvidenceItem[];
  evidence_count: number;
  hypotheses: Hypothesis[];
  root_cause: string | null;
  root_cause_confidence: number | null;
  recommended_action: Record<string, unknown>;
  gates: Record<string, GateResult>;
  policy_result: Record<string, unknown>;
  authority_result: Record<string, unknown>;
  risk_result: Record<string, unknown>;
  contradiction_detected: boolean;
  contradictions: Contradiction[];
  verification_result: VerificationResult | null;
  escalation_score: number | null;
  escalation_reasons: string[];
  circuit_breaker: { tripped?: boolean; attempts?: number; limit?: number; reason?: string | null } | null;
  action_history: { attempt?: number; status?: string; error?: string | null; detail?: string }[];
  agent_notes: string | null;
  assigned_agent: string | null;
  resolution_status: string | null;
  resolution_passport: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  stage: string;
  label: string;
  status: "running" | "ok" | "warn" | "error";
  result: Record<string, unknown>;
  evidence_count: number;
  duration_ms: number;
  error: string | null;
  created_at: string;
}

export interface EvidenceItem {
  id: string;
  source: string;
  type: string;
  label: string;
  value: unknown;
  known: boolean;
  detail?: string;
}

export interface Hypothesis {
  title: string;
  reasoning: string;
  confidence: number;
  evidenceIds: string[];
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

export interface GateCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface GateResult {
  name: string;
  status: "PASS" | "FAIL" | "REVIEW" | "BLOCK";
  detail: string;
  checks: GateCheck[];
}

export interface VerificationResult {
  overall: "passed" | "failed" | "unknown";
  checks: { name: string; expected: unknown; actual: unknown; pass: boolean }[];
  detail: string;
}

export interface Order {
  id: string;
  order_id: string;
  customer_id: string;
  status: string;
  amount: number;
  item_count: number;
  shipment_status: string | null;
  courier: string | null;
  tracking_number: string | null;
  gps_evidence: {
    delivery_gps?: { lat: number; lng: number };
    home_gps?: { lat: number; lng: number };
    distance_km?: number;
    matched?: boolean;
    note?: string;
  };
  delivered_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  txn_id: string;
  customer_id: string;
  order_id: string;
  amount: number;
  status: string;
  method: string;
  gateway: string;
  refund_api_sim_fail: boolean;
  created_at: string;
}

export interface Refund {
  id: string;
  refund_id: string;
  case_id: string | null;
  payment_id: string;
  customer_id: string;
  amount: number;
  status: string;
  issued_at: string | null;
  verification: Record<string, unknown>;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_id: string;
  customer_id: string;
  subject: string;
  category: string;
  status: string;
  resolution: string | null;
  created_at: string;
}

export interface Policy {
  id: string;
  policy_id: string;
  name: string;
  category: string;
  description: string;
  conditions: Record<string, unknown>;
  allowed_actions: string[];
  restrictions: string[];
  authority_limits: Record<string, number>;
  effective_from: string;
}

export interface Incident {
  id: string;
  incident_id: string;
  fingerprint_id: string;
  name: string;
  status: string;
  affected_case_count: number;
  first_detected_at: string;
  severity: string;
  recommended_response: string | null;
  linked_case_uuids?: string[];
}

export interface Fingerprint {
  id: string;
  fingerprint_id: string;
  name: string;
  symptoms: string[];
  affected_system: string;
  probable_root_cause: string;
  frequency: number;
  severity: string;
  recommended_recovery: string | null;
}

export interface Escalation {
  id: string;
  case_id: string;
  score: number;
  reasons: string[];
  recommended_queue: string;
  priority: string;
  passport: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  case_id: string | null;
  actor: string;
  agent: string | null;
  action: string;
  input: Record<string, unknown>;
  decision: Record<string, unknown>;
  evidence: Record<string, unknown>;
  policy: Record<string, unknown>;
  authority: Record<string, unknown>;
  risk: Record<string, unknown>;
  result: Record<string, unknown>;
  verification: Record<string, unknown>;
  created_at: string;
}

export interface AgentAction {
  id: string;
  case_id: string;
  agent_key: string;
  action: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  created_at: string;
}

export interface ActionVerification {
  id: string;
  action_id: string;
  case_id: string;
  checks: { name: string; expected: unknown; actual: unknown; pass: boolean }[];
  overall: string;
  created_at: string;
}

export interface KnowledgeCandidate {
  id: string;
  case_id: string;
  problem: string;
  root_cause: string | null;
  resolution: string;
  supporting_cases: string[];
  confidence: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  customer_id: string;
  status: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "customer" | "ai" | "agent" | "system";
  content: string;
  created_at: string;
}

export interface AnalyticsSnapshot {
  operational: {
    open_complaints: number;
    resolved_complaints: number;
    total_cases: number;
    avg_resolution_minutes: number;
    sla_compliance_pct: number;
    escalation_rate_pct: number;
    automation_success_rate_pct: number;
    verification_failure_rate_pct: number;
    avg_customer_effort: number;
    escalated_count: number;
    automation_paused_count: number;
  };
  complaints: {
    top_intents: { intent: string; cnt: number }[];
    recurring_fingerprints: { fingerprint_id: string; name: string; frequency: number; severity: string }[];
    incident_clusters: { incident_id: string; name: string; status: string; affected_case_count: number; severity: string }[];
    top_root_causes: { root_cause: string; cnt: number }[];
    duplicate_payment_cases: number;
  };
  customers: {
    total_customers: number;
    repeat_contact_customers: number;
    negative_sentiment_customers: number;
    avg_churn_risk: number;
    high_churn_risk_customers: number;
    high_value_unresolved: { customer_code: string; name: string; lifetime_value: number; tier: string; open_cases: number }[];
  };
  recent_events: { event_type: string; payload: Record<string, unknown>; created_at: string }[];
}

export interface ChatResult {
  ok: boolean;
  case_id: string;
  case_uuid: string;
  conversation_id?: string | null;
  intent: string;
  specialist: string;
  status: string;
  resolution_status: string | null;
  escalation_score: number | null;
  reply: string;
  snapshot: CaseRow;
}

export interface ChatStartResult {
  ok: boolean;
  kind?: "reply" | "case_started" | "case_updated";
  resumed?: boolean;
  case_id: string;
  case_uuid: string;
  conversation_id?: string | null;
  status: string;
  resolution_status?: string | null;
  intent?: string;
  reply?: string;
}
