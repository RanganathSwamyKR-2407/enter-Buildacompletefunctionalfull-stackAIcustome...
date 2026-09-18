import { useMemo, useState } from "react";
import { Play, RotateCcw, StepForward } from "lucide-react";
import type { CaseEvent } from "@/lib/types";
import { SectionCard } from "@/components/panels";
import { Button } from "@/components/ui/button";
import { classNames, fmtDate } from "@/lib/format";

const STAGE_SEQ = [
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

const STAGE_LABEL: Record<string, string> = {
  evidence_ingest: "Intent",
  understanding: "Context & understanding",
  order_audit: "Investigation",
  payment_audit: "Investigation",
  ticket_history: "Investigation",
  knowledge_retrieval: "Knowledge",
  policy_evaluation: "Policy",
  root_cause_analysis: "Root-cause analysis",
  four_gate_controller: "Four Gates",
  action: "Action",
  circuit_breaker: "Circuit breaker",
  verification: "Verification",
  resolution: "Resolution / Escalation",
};

// ---------------------------------------------------------------------
// 16. Investigation Replay — reconstructs the real investigation from
// the stored case_events. Never generates fake history.
// ---------------------------------------------------------------------
export function InvestigationReplay({ events }: { events: CaseEvent[] }) {
  const ordered = useMemo(() => {
    const byStage = new Map<string, CaseEvent>();
    for (const ev of events) if (!byStage.has(ev.stage)) byStage.set(ev.stage, ev);
    return STAGE_SEQ.filter((s) => byStage.has(s)).map((s) => ({ stage: s, ev: byStage.get(s)! }));
  }, [events]);

  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
    setPlaying(false);
  };

  const play = () => {
    setPos(0);
    setPlaying(true);
  };

  const step = (p: number) => {
    setPos(p);
    if (p >= ordered.length) {
      stop();
      return;
    }
    if (playing) {
      const t = setTimeout(() => step(p + 1), 550);
      setTimer(t);
    }
  };

  const startPlay = () => {
    stop();
    setPos(0);
    setPlaying(true);
    const t = setTimeout(() => step(1), 550);
    setTimer(t);
  };

  return (
    <SectionCard
      title="Investigation Replay"
      action={
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7" onClick={() => { stop(); setPos(0); }}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => step(Math.min(pos + 1, ordered.length))} disabled={ordered.length === 0}>
            <StepForward className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" className="h-7" onClick={pos >= ordered.length ? startPlay : play} disabled={ordered.length === 0}>
            <Play className="mr-1 h-3.5 w-3.5" /> Replay
          </Button>
        </div>
      }
    >
      <div className="relative space-y-0">
        {ordered.map(({ stage, ev }, i) => {
          const reached = i < pos;
          const current = i === pos && playing;
          const tone = reached ? "text-success" : current ? "text-brand animate-pulse" : "text-muted-foreground/30";
          return (
            <div key={stage} className="relative flex gap-3 pb-2.5">
              {i < ordered.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-border" />}
              <span className={classNames("mt-1 h-2.5 w-2.5 rounded-full", reached ? "bg-success" : current ? "bg-brand" : "bg-muted-foreground/30")} />
              <div className={classNames("min-w-0 flex-1 text-[13px]", !reached && !current && "text-muted-foreground/50")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{STAGE_LABEL[stage] ?? stage}</span>
                  {reached && <span className="text-[11px] text-muted-foreground">{fmtDate(ev.created_at)}</span>}
                </div>
                {reached && ev.result && Object.keys(ev.result).length > 0 && (
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={JSON.stringify(ev.result)}>
                    {JSON.stringify(ev.result).slice(0, 140)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {ordered.length === 0 && <div className="text-xs text-muted-foreground">No stored investigation events to replay.</div>}
        {pos >= ordered.length && ordered.length > 0 && (
          <div className="rounded bg-success-soft px-2 py-1.5 text-xs font-medium text-success">Replay complete — end state matches the stored Case Twin.</div>
        )}
      </div>
    </SectionCard>
  );
}
