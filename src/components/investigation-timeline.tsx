import { CheckCircle2, XCircle, AlertTriangle, Loader2, Circle } from "lucide-react";
import type { CaseEvent } from "@/lib/types";
import { classNames, fmtDate } from "@/lib/format";

const STAGE_ORDER = [
  "evidence_ingest",
  "understanding",
  "order_audit",
  "payment_audit",
  "ticket_history",
  "knowledge_retrieval",
  "policy_evaluation",
  "root_cause_analysis",
  "contradiction_check",
  "four_gate_controller",
  "action",
  "circuit_breaker",
  "verification",
  "resolution",
];

export function InvestigationTimeline({
  events,
  running,
}: {
  events: CaseEvent[];
  running: boolean;
}) {
  const evs = events ?? [];
  const byStage = new Map<string, CaseEvent>();
  for (const ev of evs) {
    byStage.set(ev.stage, ev);
  }

  const ordered = STAGE_ORDER.filter((s) => byStage.has(s) || s === "contradiction_check" || s === "circuit_breaker").map(
    (s) => ({ stage: s, ev: byStage.get(s) ?? null }),
  );

  return (
    <div className="relative">
      {ordered.map(({ stage, ev }, idx) => {
        const isLast = idx === ordered.length - 1;
        const has = Boolean(ev);
        const status = ev?.status;
        const Icon = !has
          ? Circle
          : status === "ok"
            ? CheckCircle2
            : status === "warn"
              ? AlertTriangle
              : status === "error"
                ? XCircle
                : Loader2;
        const tone = !has
          ? "text-muted-foreground/30"
          : status === "ok"
            ? "text-success"
            : status === "warn"
              ? "text-warning"
              : status === "error"
                ? "text-danger"
                : "text-info animate-spin";

        return (
          <div key={stage} className="relative flex gap-3 pb-3">
            {!isLast && (
              <span className="absolute left-[9px] top-5 h-full w-px bg-border" />
            )}
            <div className={classNames("mt-0.5", tone)}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 rounded-md border bg-card px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-medium">
                  {ev?.label ?? STAGE_LABEL[stage] ?? stage}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {ev && ev.evidence_count > 0 && <span>{ev.evidence_count} evidence</span>}
                  {ev && ev.duration_ms > 0 && <span>{ev.duration_ms}ms</span>}
                  {ev && <span>{fmtDate(ev.created_at)}</span>}
                </div>
              </div>
              {ev?.result && Object.keys(ev.result).length > 0 && (
                <div className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(ev.result, null, 0).slice(0, 320)}
                </div>
              )}
              {ev?.error && (
                <div className="mt-1 text-[11px] font-medium text-danger">{ev.error}</div>
              )}
            </div>
          </div>
        );
      })}
      {running && (
        <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Investigating…
        </div>
      )}
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  evidence_ingest: "Evidence Ingest",
  understanding: "AI Understanding",
  order_audit: "Order Audit",
  payment_audit: "Payment Audit",
  ticket_history: "Ticket History",
  knowledge_retrieval: "Knowledge Retrieval",
  policy_evaluation: "Policy Evaluation",
  root_cause_analysis: "Root Cause Analysis",
  contradiction_check: "Contradiction Check",
  four_gate_controller: "Four-Gate Controller",
  action: "Action",
  circuit_breaker: "Circuit Breaker",
  verification: "Verification",
  resolution: "Resolution",
};
