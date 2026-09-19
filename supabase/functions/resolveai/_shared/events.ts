// =====================================================================
// ResolveAI — event / audit / analytics / case-update helpers
// (requires Enter Cloud db client — Deno only)
// =====================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export async function emitCaseEvent(
  db: SupabaseClient,
  caseUuid: string,
  stage: string,
  label: string,
  status: "running" | "ok" | "warn" | "error",
  result: Record<string, unknown> = {},
  evidenceCount = 0,
  durationMs = 0,
  error?: string,
): Promise<void> {
  await db.from("resolveai_case_events").insert({
    case_id: caseUuid,
    stage,
    label,
    status,
    result,
    evidence_count: evidenceCount,
    duration_ms: durationMs,
    error: error ?? null,
  });
}

export async function emitAudit(
  db: SupabaseClient,
  caseUuid: string,
  actor: string,
  agent: string,
  action: string,
  fields: {
    input?: Record<string, unknown>;
    decision?: Record<string, unknown>;
    evidence?: Record<string, unknown>;
    policy?: Record<string, unknown>;
    authority?: Record<string, unknown>;
    risk?: Record<string, unknown>;
    result?: Record<string, unknown>;
    verification?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await db.from("resolveai_audit_logs").insert({
    case_id: caseUuid,
    actor,
    agent,
    action,
    input: fields.input ?? {},
    decision: fields.decision ?? {},
    evidence: fields.evidence ?? {},
    policy: fields.policy ?? {},
    authority: fields.authority ?? {},
    risk: fields.risk ?? {},
    result: fields.result ?? {},
    verification: fields.verification ?? {},
  });
}

export async function emitAnalytics(
  db: SupabaseClient,
  customerUuid: string | null,
  caseUuid: string | null,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.from("resolveai_analytics_events").insert({
    customer_id: customerUuid,
    case_id: caseUuid,
    event_type: eventType,
    payload,
  });
}

export async function updateCase(
  db: SupabaseClient,
  caseUuid: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db.from("resolveai_cases").update(patch).eq("id", caseUuid);
}

/** Escape a LIKE pattern so customer text is matched literally. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** True when the conversation already contains a message with the same
 * role + content (case-insensitive, trimmed). Guards the transcript against
 * duplicate rows from repeated runs / retries / self-checks so a customer's
 * chat never repeats text. */
export async function messageAlreadyExists(
  db: SupabaseClient,
  convoUuid: string | null,
  role: string,
  content: string,
): Promise<boolean> {
  const text = (content ?? "").trim();
  if (!convoUuid || !text) return false;
  const { data } = await db
    .from("resolveai_messages")
    .select("id")
    .eq("conversation_id", convoUuid)
    .eq("role", role)
    .ilike("content", likeEscape(text));
  return (data ?? []).length > 0;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
