// ResolveAI — typed API wrappers over the resolveai backend function
import { supabase } from "@/integrations/supabase/client";
import type {
  AnalyticsSnapshot,
  CaseEvent,
  CaseRow,
  ChatResult,
} from "./types";

const FN = "resolveai";

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FN, { body });
  if (error) throw new Error(error.message);
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
  chat: (message: string, customerId?: string) =>
    invoke<ChatResult>({ route: "chat", message, customer_id: customerId }),

  /** Run a staff-initiated gated action on a case. */
  action: (payload: {
    action: string;
    case_id: string;
    payment_txn?: string;
    payment_id?: string;
    amount?: number;
    note?: string;
    content?: string;
  }) => invoke<{ ok: boolean; action: string; result: unknown; verification: unknown }>({ route: "actions", ...payload }),

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
};

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
