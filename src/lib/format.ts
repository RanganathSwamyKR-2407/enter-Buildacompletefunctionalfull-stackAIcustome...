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
