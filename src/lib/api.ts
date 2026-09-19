// ResolveAI — typed API wrappers over the resolveai backend function
import { supabase } from "@/integrations/supabase/client";
import type {
  AnalyticsSnapshot,
  CaseEvent,
  CaseRow,
  ChatResult,
  ChatStartResult,
} from "./types";

const FN = "resolveai";

async function invoke<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FN, { body, signal });
  if (error) {
    // Surface the backend's own error message when available instead of a
    // generic "non-2xx status code".
    const res = (error as { context?: Response }).context;
    if (res) {
      try {
        const text = await res.text();
        const parsed = JSON.parse(text) as { error?: string; detail?: string };
        throw new Error(parsed.detail || parsed.error || error.message);
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(error.message);
        throw e;
      }
    }
    throw new Error(error.message);
  }
  return data as T;
}

export interface SelfCheckResult {
  allPass: boolean;
  results: {
    scenario: string;
    case_id: string;
    pass: boolean;
    [key: string]: unknown;
  }[];
}

export const api = {
  /** Send a customer message → full autonomous lifecycle (returns the final reply). */
  chat: (message: string, customerId?: string, fast?: boolean) =>
    invoke<ChatResult>({ route: "chat", message, customer_id: customerId, fast: fast === true }),

  /** Chat entry point: detects complaints vs chatter. Non-complaints get a
   * reply without a case; complaints return case_started (new or resumed
   * active case) so the caller can continue the live pipeline. */
  chatSend: (message: string, customerId?: string) =>
    invoke<ChatStartResult>({ route: "chat", message, customer_id: customerId, start_only: true }),

  /** Live two-phase flow (continue): run the full pipeline on an existing case, streaming events via realtime. */
  chatContinue: (caseUuid: string, conversationId?: string | null, message?: string, signal?: AbortSignal) =>
    invoke<ChatResult>(
      {
        route: "chat",
        case_uuid: caseUuid,
        conversation_id: conversationId ?? undefined,
        message: message ?? undefined,
      },
      signal,
    ),

  /** Run a staff-initiated gated action on a case. Supports human approval:
   * pass `human_decision: "approve" | "reject"` and optionally a modified amount. */
  action: (payload: {
    action: string;
    case_id: string;
    payment_txn?: string;
    payment_id?: string;
    amount?: number;
    note?: string;
    content?: string;
    human_decision?: "approve" | "reject";
  }) =>
    invoke<{
      ok: boolean;
      action: string;
      result?: unknown;
      verification?: unknown;
      blocked?: boolean;
      requires_human_approval?: boolean;
      approvable_by_human?: boolean;
      gates?: Record<string, unknown>;
      amount?: number;
      detail?: string;
    }>({ route: "actions", ...payload }),

  /** Force-escalate a case with a generated Resolution Passport. */
  escalate: (caseId: string) =>
    invoke<{ ok: boolean; case_id: string; score: number; reasons: string[]; passport: Record<string, unknown> }>({
      route: "escalate",
      case_id: caseId,
    }),

  /** Server-computed operational analytics. */
  analytics: () => invoke<{ ok: boolean; analytics: AnalyticsSnapshot }>({ route: "analytics" }),

  /** Incidents + fingerprints with linked cases. */
  incidents: () =>
    invoke<{ ok: boolean; incidents: Incident[]; fingerprints: Fingerprint[] }>({ route: "incidents" }),

  /** Create demo auth accounts (idempotent). */
  bootstrap: () => invoke<{ ok: boolean; accounts: { email: string; status: string }[] }>({ route: "bootstrap" }),

  /** Integration harness for demo tracks A/B/C. */
  selfcheck: () => invoke<SelfCheckResult>({ route: "selfcheck" }),

  /** Knowledge feedback loop: list/create/review knowledge candidates. */
  knowledgeCandidates: (op: string, payload: Record<string, unknown> = {}) =>
    invoke<{ ok: boolean; candidates?: unknown[]; candidate?: unknown }>({
      route: "knowledge_candidates",
      op,
      ...payload,
    }),

  /** Real system-health checks (database, auth, AI, RAG, engine, realtime…). */
  health: () =>
    invoke<{ ok: boolean; status: string; checks: { component: string; status: string; detail: string }[] }>({
      route: "health",
    }),

  /** Associate a verified OAuth identity with an existing profile by email. */
  linkAccount: () =>
    invoke<{ ok: boolean; linked?: boolean; customer_id?: string; detail?: string }>({ route: "link_account" }),

  /** Read the authenticated user's own profile. */
  profile: () =>
    invoke<{ ok: boolean; profile: ProfileShape; detail?: string }>({ route: "profile", op: "get" }),

  /** Update own (or, for Manager/Admin, managed staff) profile fields. Role is never editable. */
  updateProfile: (payload: Record<string, unknown>) =>
    invoke<{ ok: boolean; changes: Record<string, { from: string; to: string }>; detail?: string }>({
      route: "profile",
      op: "update",
      ...payload,
    }),

  /** Manager/Admin: list staff team for profile management. */
  team: () =>
    invoke<{ ok: boolean; team: TeamMember[] }>({ route: "team" }),
};

export interface ProfileShape {
  user_id: string;
  email?: string | null;
  role: string;
  name: string;
  display_name?: string;
  avatar_url?: string;
  phone?: string;
  department?: string;
  job_title?: string;
  bio?: string;
  tier?: string;
  customer_code?: string;
  is_staff: boolean;
}

export interface TeamMember {
  user_id: string;
  name: string;
  display_name: string | null;
  role: string;
  department: string | null;
  job_title: string | null;
  avatar_url: string | null;
  phone: string | null;
}

/** Direct DB reads (RLS-scoped). */
export const db = {
  cases: (filters: Record<string, unknown> = {}, limit = 200) =>
    supabase
      .from("resolveai_cases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then((r) => {
        if (r.error) throw r.error;
        return (r.data ?? []) as CaseRow[];
      }),
  case: (uuid: string) =>
    supabase
      .from("resolveai_cases")
      .select("*")
      .eq("id", uuid)
      .maybeSingle()
      .then((r) => {
        if (r.error) throw r.error;
        return r.data as CaseRow | null;
      }),
  caseEvents: (uuid: string) =>
    supabase
      .from("resolveai_case_events")
      .select("*")
      .eq("case_id", uuid)
      .order("created_at", { ascending: true })
      .then((r) => {
        if (r.error) throw r.error;
        return (r.data ?? []) as CaseEvent[];
      }),
  audit: (caseUuid?: string, limit = 100) =>
    supabase
      .from("resolveai_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
  escalations: (limit = 50) =>
    supabase
      .from("resolveai_escalations")
      .select("*, resolveai_cases(*)")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
  customers: (limit = 100) =>
    supabase
      .from("resolveai_customers")
      .select("*")
      .order("lifetime_value", { ascending: false })
      .limit(limit)
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
  orders: (limit = 100) =>
    supabase
      .from("resolveai_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
  payments: (limit = 100) =>
    supabase
      .from("resolveai_payments")
      .select("*, resolveai_orders(order_id), resolveai_customers(name, customer_code)")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
  refunds: (limit = 100) =>
    supabase
      .from("resolveai_refunds")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
  policies: () =>
    supabase
      .from("resolveai_policies")
      .select("*")
      .order("policy_id", { ascending: true })
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
  agents: () =>
    supabase
      .from("resolveai_agents")
      .select("*")
      .order("agent_key", { ascending: true })
      .then((r) => {
        if (r.error) throw r.error;
        return r.data ?? [];
      }),
};
