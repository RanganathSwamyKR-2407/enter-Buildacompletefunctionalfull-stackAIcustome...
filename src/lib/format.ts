// ResolveAI — formatting helpers

export const inr = (n: number | null | undefined): string => {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const fmtDateOnly = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const timeAgo = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const slaRemaining = (deadline: string | null | undefined): { text: string; critical: boolean } => {
  if (!deadline) return { text: "—", critical: false };
  const ms = new Date(deadline).getTime() - Date.now();
  const mins = Math.floor(ms / 60000);
  if (ms <= 0) return { text: "SLA BREACHED", critical: true };
  if (mins < 60) return { text: `${mins}m left`, critical: mins < 30 };
  const h = Math.floor(mins / 60);
  return { text: `${h}h ${mins % 60}m left`, critical: false };
};

export const pct = (n: number | null | undefined): string =>
  n == null ? "—" : `${Math.round(n)}%`;

export const confidenceLabel = (n: number | null | undefined): string =>
  n == null ? "—" : `${Math.round(n * 100)}%`;

export const pctOf = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100));

export const classNames = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");

/** snake_case / kebab / internal status → readable Title Case ("automation_paused" → "Automation Paused"). */
export function humanLabel(value: string | null | undefined): string {
  if (!value) return "Not available";
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render a single backend value as a human-readable string. */
export function humanValue(value: unknown): string {
  if (value === null || value === undefined) return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Not available";
  if (typeof value === "string") return value === "" ? "Not available" : value;
  if (Array.isArray(value)) return value.length === 0 ? "None" : value.map((v) => humanValue(v)).join(", ");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.entries(obj)
      .slice(0, 4)
      .map(([k, v]) => `${humanLabel(k)}: ${humanValue(v)}`)
      .join(" · ");
  }
  return String(value);
}

/**
 * Turn an arbitrary result object into a list of readable label/value rows.
 * Used to render backend result payloads without ever dumping raw JSON.
 */
export function readableRows(result: Record<string, unknown> | null | undefined, max = 6): { label: string; value: string }[] {
  if (!result || typeof result !== "object") return [];
  const rows: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(result)) {
    if (rows.length >= max) break;
    const v = humanValue(value);
    if (v === "Not available" || v === "None") continue;
    rows.push({ label: humanLabel(key), value: v.slice(0, 140) });
  }
  return rows;
}

/** Initials avatar text from a display name. */
export function initials(name: string | null | undefined): string {
  return (name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}
