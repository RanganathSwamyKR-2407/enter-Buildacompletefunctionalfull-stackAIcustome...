import { Brain, AlertTriangle, GitCompareArrows, Timer, LifeBuoy, Eye, Zap } from "lucide-react";
import type { CaseRow, CaseEvent, Contradiction, GateResult } from "@/lib/types";
import { SectionCard } from "@/components/panels";
import { Badge } from "@/components/ui/badge";
import { classNames, confidenceLabel, fmtDate, inr } from "@/lib/format";
import { assessUncertainty, computeCustomerEffort } from "@/lib/engine";
import type { UncertaintyResult } from "@/lib/engine";

const TAG = {
  FACT: "bg-success-soft text-success",
  INFERENCE: "bg-warning-soft text-warning",
  HYPOTHESIS: "bg-info-soft text-info",
  DECISION: "bg-brand-soft text-brand",
};

function Tag({ kind }: { kind: keyof typeof TAG }) {
  return (
    <span className={classNames("rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide", TAG[kind])}>
      {kind}
    </span>
  );
}

// ---------------------------------------------------------------------
// 1. AI Decision Trace — concise, auditable decision factors, no CoT.
// ---------------------------------------------------------------------
export function DecisionTrace({ caseRow }: { caseRow: CaseRow }) {
  const knowledge = (caseRow.evidence ?? []).filter((e) => e.source === "knowledge");
  const gates = (caseRow.gates ?? {}) as Record<string, GateResult>;
  const authority = caseRow.authority_result ?? gates.authority;
  const risk = caseRow.risk_result ?? gates.risk;
  const decision =
    caseRow.status === "resolved"
      ? "Autonomous resolution executed & verified"
      : caseRow.status === "escalated"
        ? "Escalated to human support"
        : caseRow.status === "automation_paused"
          ? "Automation paused (circuit breaker)"
          : "Awaiting action";

  return (
    <SectionCard title="AI Decision Trace" icon={<Brain className="h-4 w-4 text-brand" />}>
      <div className="space-y-1.5 text-[13px]">
        <TraceRow tag="FACT" label="Customer intent" value={caseRow.intent ?? "—"} />
        <TraceRow tag="FACT" label="Relevant context" value={`${(caseRow.order_ids ?? []).length} order(s) · ${(caseRow.transaction_ids ?? []).length} txn(s) · ${(caseRow.ticket_ids ?? []).length} prior ticket(s)`} />
        <TraceRow tag="FACT" label="Evidence used" value={`${caseRow.evidence_count ?? 0} items from ${new Set((caseRow.evidence ?? []).map((e) => e.source)).size} source(s)`} />
        <TraceRow tag="FACT" label="Evidence sources" value={[...new Set((caseRow.evidence ?? []).map((e) => e.source))].join(", ") || "—"} />
        <TraceRow tag="FACT" label="Retrieved knowledge" value={knowledge.length ? `${knowledge.length} document chunk(s)` : "None matched"} />
        <TraceRow tag="FACT" label="Relevant policy" value={`${(caseRow.policy_result as Record<string, unknown>)?.policy_id ?? "—"} · ${(caseRow.policy_result as Record<string, unknown>)?.reason ?? ""}`} />
        <TraceRow tag="HYPOTHESIS" label="Root-cause hypothesis" value={`${caseRow.root_cause ?? "—"} (${confidenceLabel(caseRow.root_cause_confidence)})`} />
        <TraceRow tag="HYPOTHESIS" label="Alternative hypotheses" value={(caseRow.hypotheses ?? []).slice(1).map((h) => h.title).join("; ") || "None"} />
        <TraceRow tag="DECISION" label="Confidence" value={confidenceLabel(caseRow.root_cause_confidence ?? caseRow.routing_confidence)} />
        <TraceRow tag="FACT" label="Authority result" value={String((authority as GateResult)?.status ?? "—")} />
        <TraceRow tag="FACT" label="Risk result" value={String((risk as GateResult)?.status ?? "—")} />
        <TraceRow tag="DECISION" label="Final decision" value={decision} />
        <TraceRow tag="DECISION" label="Decision reason" value={caseRow.resolution_status ?? "No decision recorded"} />
      </div>
    </SectionCard>
  );
}

function TraceRow({ tag, label, value }: { tag: keyof typeof TAG; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border px-2 py-1">
      <div className="flex items-center gap-2">
        <Tag kind={tag} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// 6. Uncertainty / low-confidence indicator
// ---------------------------------------------------------------------
export function UncertaintyPanel({ caseRow }: { caseRow: CaseRow }) {
  const evidenceCount = (caseRow.evidence ?? []).length;
  const contradictions = (caseRow.contradictions ?? []).length;
  const u: UncertaintyResult = assessUncertainty({
    aiConfidence: caseRow.root_cause_confidence ?? caseRow.routing_confidence,
    evidenceCount,
    expectedEvidence: 5,
    contradictions,
    policyCertain: Boolean((caseRow.policy_result as Record<string, unknown>)?.allowed),
    actionRisk: ((caseRow.risk_result as GateResult)?.status === "BLOCK" ? "high" : (caseRow.risk_result as GateResult)?.status === "REVIEW" ? "medium" : "low") as "low" | "medium" | "high",
  });
  const tone = u.level === "HIGH" ? "danger" : u.level === "MODERATE" ? "warning" : "success";
  return (
    <SectionCard
      title="Uncertainty Indicator"
      icon={<AlertTriangle className={`h-4 w-4 text-${tone}`} />}
      action={
        <Badge className={classNames(u.level === "HIGH" && "bg-danger-soft text-danger", u.level === "MODERATE" && "bg-warning-soft text-warning", u.level === "LOW" && "bg-success-soft text-success")}>
          {u.level}
        </Badge>
      }
    >
      <div className="space-y-1.5 text-[13px]">
        <Row k="AI confidence" v={confidenceLabel(u.confidence)} />
        <Row k="Evidence completeness" v={`${Math.round(u.evidenceCompleteness * 100)}%`} />
        <Row k="Evidence consistency" v={u.evidenceConsistency} />
        <Row k="Policy certainty" v={u.policyCertainty} />
        <Row k="Action risk" v={u.actionRisk} />
        {u.missingEvidence.length > 0 && (
          <div className="rounded border border-warning/40 bg-warning-soft/40 px-2 py-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-warning">Missing evidence</div>
            <ul className="mt-0.5 list-inside list-disc text-xs text-muted-foreground">
              {u.missingEvidence.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">{u.reason}</div>
        {u.blockAutoResolution && (
          <div className="rounded bg-danger-soft px-2 py-1.5 text-xs font-semibold text-danger">
            Autonomous resolution blocked — human review recommended.
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 7. Improved Contradiction Matrix
// ---------------------------------------------------------------------
export function ContradictionMatrix({ contradictions }: { contradictions: Contradiction[] }) {
  if (!contradictions || contradictions.length === 0) return null;
  return (
    <SectionCard title="Contradiction Matrix" icon={<GitCompareArrows className="h-4 w-4 text-danger" />}>
      {contradictions.map((c) => (
        <div key={c.id} className="mb-3 last:mb-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-2">Evidence source</th>
                <th className="py-1">Finding</th>
              </tr>
            </thead>
            <tbody>
              {c.evidence.map((e, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-2 font-medium">{e.source}</td>
                  <td className={classNames("py-1", e.source === "GPS" && c.type === "delivery_contradiction" ? "text-danger" : "")}>{e.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 space-y-1 text-xs">
            <div>
              <span className="font-semibold text-danger">Contradiction type:</span> {c.type}
            </div>
            <div>
              <span className="font-semibold">Impact:</span> {c.impact ?? "—"}
            </div>
            <div>
              <span className="font-semibold">Required action:</span> {c.requiredAction ?? c.decision}
            </div>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 14. SLA Intelligence
// ---------------------------------------------------------------------
export function SLAIntelligence({ caseRow }: { caseRow: CaseRow }) {
  const created = caseRow.created_at ? new Date(caseRow.created_at).getTime() : Date.now();
  const deadline = caseRow.sla_deadline ? new Date(caseRow.sla_deadline).getTime() : null;
  const now = Date.now();
  const remainingMs = deadline ? deadline - now : null;
  const elapsedMs = now - created;
  const status = !deadline ? "UNKNOWN" : remainingMs <= 0 ? "BREACHED" : remainingMs < 30 * 60000 ? "AT RISK" : "ON TRACK";
  const reason = !deadline
    ? "No SLA deadline set"
    : status === "BREACHED"
      ? `Deadline ${fmtDate(caseRow.sla_deadline)} passed`
      : status === "AT RISK"
        ? `Under 30 minutes remaining (${fmtDate(caseRow.sla_deadline)})`
        : `Deadline ${fmtDate(caseRow.sla_deadline)}`;
  const tone = status === "BREACHED" ? "danger" : status === "AT RISK" ? "warning" : "success";
  const rem = remainingMs != null ? `${Math.max(0, Math.floor(remainingMs / 3600000))}h ${Math.max(0, Math.floor((remainingMs % 3600000) / 60000))}m` : "—";
  return (
    <SectionCard
      title="SLA Intelligence"
      icon={<Timer className="h-4 w-4 text-info" />}
      action={<Badge className={classNames(status === "BREACHED" && "bg-danger-soft text-danger", status === "AT RISK" && "bg-warning-soft text-warning", status === "ON TRACK" && "bg-success-soft text-success")}>{status}</Badge>}
    >
      <div className="space-y-1.5 text-[13px]">
        <Row k="Time remaining" v={rem} />
        <Row k="Investigation duration" v={`${Math.round(elapsedMs / 60000)}m`} />
        <Row k="SLA status" v={status} />
        <Row k="SLA risk reason" v={reason} />
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 15. Human Handoff Summary
// ---------------------------------------------------------------------
export function HandoffSummary({ caseRow, events }: { caseRow: CaseRow; events?: CaseEvent[] }) {
  const known = (caseRow.evidence ?? []).filter((e) => e.known).map((e) => e.label);
  const unknown = (caseRow.evidence ?? []).filter((e) => !e.known).map((e) => e.label);
  const attempted = (caseRow.action_history ?? []).map((a) => `attempt ${a.attempt ?? "?"}: ${a.status ?? a.detail}`).join("; ") || "None";
  const automationStopped =
    caseRow.status === "escalated"
      ? (caseRow.contradictions ?? []).length > 0
        ? "Contradictory evidence blocked autonomous resolution."
        : (caseRow.circuit_breaker?.tripped
          ? `Circuit breaker tripped after ${caseRow.circuit_breaker.attempts} failed attempts.`
          : "Escalated for human review.")
      : "Awaiting action.";

  return (
    <SectionCard title="Human Handoff Summary" icon={<LifeBuoy className="h-4 w-4 text-danger" />}>
      <Handoff k="CUSTOMER ISSUE" v={caseRow.message_text ?? "—"} />
      <Handoff k="CURRENT STATUS" v={`${caseRow.status} · ${caseRow.resolution_status ?? ""}`} />
      <Handoff k="WHAT WE KNOW" v={known.slice(0, 5).join("; ") || "—"} />
      <Handoff k="WHAT WE DON'T KNOW" v={unknown.length ? unknown.slice(0, 5).join("; ") : "Nothing flagged"} />
      <Handoff k="WHAT WAS ATTEMPTED" v={attempted} />
      <Handoff k="WHY AUTOMATION STOPPED" v={automationStopped} />
      <Handoff k="RECOMMENDED NEXT STEP" v={(caseRow.recommended_action as Record<string, unknown>)?.action ? JSON.stringify(caseRow.recommended_action) : "Review evidence and proceed manually."} />
      <div className="mt-2 text-[11px] text-muted-foreground">{(events ?? []).length} investigation events recorded · {fmtDate(caseRow.updated_at)}</div>
    </SectionCard>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

function Handoff({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border px-2 py-1.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="mt-0.5 text-[13px]">{v}</div>
    </div>
  );
}

export { computeCustomerEffort };

// ---------------------------------------------------------------------
// 26 / E. AI Action Preview — shows what the system is about to do and
// why, before it passes through the deterministic gates. It is not a
// bypass: the Four-Gate Controller still authorizes execution.
// ---------------------------------------------------------------------
export function ActionPreview({ caseRow }: { caseRow: CaseRow }) {
  const rec = (caseRow.recommended_action ?? {}) as Record<string, unknown>;
  const action = String(rec.action ?? "—");
  const gates = (caseRow.gates ?? {}) as Record<string, GateResult>;
  const riskStatus = String((caseRow.risk_result as GateResult)?.status ?? "—");
  const confidence = confidenceLabel(caseRow.root_cause_confidence ?? caseRow.routing_confidence);
  const evidenceIds = (caseRow.evidence ?? []).slice(0, 4).map((e) => e.label);
  const expected =
    action === "issue_refund"
      ? `Refund ${inr(Number(rec.amount ?? 0))} issued and independently verified (payment marked refunded).`
      : action === "update_ticket"
        ? "Ticket updated with the investigation outcome."
        : action === "send_message"
          ? "Customer informed with a grounded reply."
          : "No autonomous action recommended.";

  return (
    <SectionCard title="AI Action Preview" icon={<Eye className="h-4 w-4 text-brand" />}>
      <div className="rounded border border-brand/30 bg-brand-soft/20 p-2.5 text-[13px]">
        <div className="flex items-center gap-2 font-semibold">
          <Zap className="h-4 w-4 text-brand" /> ACTION — {action}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Reason: {caseRow.routing_reason ?? caseRow.resolution_status ?? "Decision from investigation"}</div>
      </div>
      <div className="mt-2 space-y-1.5 text-[13px]">
        <Row k="Evidence" v={evidenceIds.length ? evidenceIds.join(" · ") : "—"} />
        <Row k="Policy" v={String((caseRow.policy_result as Record<string, unknown>)?.policy_id ?? "—")} />
        <Row k="Expected result" v={expected} />
        <Row k="Risk / confidence" v={`${riskStatus} · ${confidence}`} />
        <div className="mt-1 rounded bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          Preview is informational. Execution still requires the Four-Gate Controller ({Object.values(gates).map((g) => g.status).join(" / ")}) and is verified + audited.
        </div>
      </div>
    </SectionCard>
  );
}
