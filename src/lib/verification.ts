import type { VerificationResult } from "@/lib/types";

/**
 * Normalize a raw verification value (from the database, API or realtime)
 * into the shape VerificationPanel can always render.
 *
 * The `resolveai_cases.verification_result` column defaults to `{}` and may
 * arrive as `null`, `{}`, a partial object, or a full verification record.
 * Any of these must yield a safe structure — never `checks: undefined`.
 */
export function normalizeVerification(raw: unknown): VerificationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const checks = Array.isArray(obj.checks) ? obj.checks : [];
  const overall =
    obj.overall === "passed" || obj.overall === "failed" || obj.overall === "unknown"
      ? obj.overall
      : checks.length > 0
        ? "unknown"
        : "unknown";
  const detail = typeof obj.detail === "string" ? obj.detail : "";
  // Treat an empty record as "no verification yet" so the panel shows its
  // loading/empty state instead of an empty verified box.
  if (checks.length === 0 && !detail) return null;
  return { overall, checks, detail };
}

/** Safe array accessor for values that are expected to be arrays. */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
