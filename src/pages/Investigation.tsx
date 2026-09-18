import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { db, api } from "@/lib/api";
import { useCaseEvents } from "@/hooks/useCaseEvents";
import { useAuth } from "@/context/AuthContext";
import {
  StatusBadge,
  PriorityBadge,
  IntentBadge,
  SentimentIndicator,
  EscalationBadge,
} from "@/components/badges";
import { InvestigationTimeline } from "@/components/investigation-timeline";
import {
  EvidencePanel,
  HypothesisPanel,
  GateStatus,
  VerificationPanel,
  RAGSources,
  ConfidenceBar,
} from "@/components/panels";
import { EscalationPanel, ResolutionPassport } from "@/components/passport";
import { AuditTimeline } from "@/components/audit-timeline";
import { LoadingState, EmptyState } from "@/components/widgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TriangleAlert,
  PauseCircle,
  ArrowUpRight,
  RefreshCw,
  Send,
} from "lucide-react";
import { slaRemaining, fmtDate, inr, confidenceLabel, classNames } from "@/lib/format";
import type { CaseRow, CaseEvent, Escalation, AuditLog, Message } from "@/lib/types";
import { DecisionTrace, UncertaintyPanel, ContradictionMatrix, SLAIntelligence, HandoffSummary, ActionPreview } from "@/components/ops-panels";
import { ApprovalPanel, VerificationCenter, BreakerMonitor, SimulationPanel } from "@/components/action-center";
import { RAGQuality, KnowledgeCandidates } from "@/components/knowledge-panels";
import { InvestigationReplay } from "@/components/replay";
import { computeCustomerEffort } from "@/lib/engine";
import { humanValue } from "@/lib/format";
import { asArray, normalizeVerification } from "@/lib/verification";

export default function Investigation() {
  const { caseId } = useParams<{ caseId: string }>();
  const { staffRole } = useAuth();
  const queryClient = useQueryClient();

  const { data: staticCase, isLoading: caseLoading, isError: caseError, refetch: refetchCase } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => db.case(caseId!),
    enabled: Boolean(caseId),
  });

  const { events, caseRow, connected } = useCaseEvents(caseId ?? null);
  const cs = (caseRow ?? staticCase) as CaseRow | null;

  const { data: customer } = useQuery({
    queryKey: ["inv-customer", cs?.customer_id],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_customers").select("*").eq("id", cs!.customer_id).maybeSingle();
      return (data ?? null) as { name: string; customer_code: string; tier: string; lifetime_value: number } | null;
    },
    enabled: Boolean(cs?.customer_id),
  });

  const { data: escalations } = useQuery({
    queryKey: ["inv-escalations", caseId],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_escalations").select("*").eq("case_id", caseId!).order("created_at", { ascending: false });
      return (data ?? []) as Escalation[];
    },
    enabled: Boolean(caseId),
  });

  const { data: audit } = useQuery({
    queryKey: ["inv-audit", caseId],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_audit_logs").select("*").eq("case_id", caseId!).order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as AuditLog[];
    },
    enabled: Boolean(caseId),
  });

  const [messageNote, setMessageNote] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    if (!cs?.case_id) return;
    document.title = `${cs.case_id} · ResolveAI`;
    return () => {
      document.title = "ResolveAI";
    };
  }, [cs?.case_id]);

  if (caseError && !cs) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-danger/30 bg-danger-soft/20 p-6 text-center">
        <TriangleAlert className="h-8 w-8 text-danger" />
        <div className="text-sm font-semibold">Unable to load investigation data</div>
        <div className="max-w-md text-xs text-muted-foreground">
          The case could not be loaded. This usually means the case does not exist or you do not have access to it.
        </div>
        <Button size="sm" variant="outline" onClick={() => void refetchCase()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (caseLoading && !cs) return <LoadingState label="Loading case…" />;
  if (!cs) return <LoadingState label="Loading case…" />;

  const sla = slaRemaining(cs.sla_deadline);
  const investigating = cs.status === "investigating" || cs.status === "verifying" || cs.status === "action_required";
  const ragSources = (asArray(cs.evidence).filter((e) => e.source === "knowledge")).map((e) => ({
    doc_id: String((e.value as { doc_id?: string })?.doc_id ?? ""),
    title: e.label.split(" — ")[0],
    score: Number((e.value as { score?: number })?.score ?? 0),
  }));

  const runAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setActing(action);
    try {
      const res = await api.action({ action, case_id: cs.id, ...extra });
      await queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      await queryClient.invalidateQueries({ queryKey: ["inv-audit", caseId] });
      // refetch via db direct
      const fresh = await db.case(cs.id);
      queryClient.setQueryData(["case", caseId], fresh);
      const detail = res.result
        ? Object.entries((res.result as Record<string, unknown>) ?? {}).map(([k, v]) => `${k}: ${humanValue(v)}`).join("\n")
        : (res.detail ?? (res.blocked ? "Action blocked by the four-gate controller." : "Action executed."));
      alert(`${res.ok ? "Action executed" : "Action blocked"}\n${detail}`);
    } catch (e) {
      alert(`Action failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActing(null);
    }
  };

  const sendMessage = async () => {
    if (!messageNote.trim()) return;
    await runAction("send_message", { content: messageNote.trim() });
    setMessageNote("");
  };

  const escalation = escalations && escalations.length > 0 ? escalations[0] : null;

  return (
    <div className="space-y-4">
      {/* Case header */}
      <div className={classNames("rounded-lg border p-4", cs.contradiction_detected ? "border-danger/50 bg-danger-soft/20" : "border")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">{cs.case_id}</span>
          <StatusBadge status={cs.status} />
          <PriorityBadge priority={cs.priority} />
          <IntentBadge intent={cs.intent} />
          <SentimentIndicator sentiment={cs.sentiment} score={cs.sentiment_score} />
          <EscalationBadge score={cs.escalation_score} />
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className={classNames("relative flex h-2 w-2")}>
              <span className={classNames("absolute h-full w-full rounded-full", connected ? "animate-ping bg-success opacity-60" : "bg-muted-foreground")} />
              <span className={classNames("relative h-2 w-2 rounded-full", connected ? "bg-success" : "bg-muted-foreground")} />
            </span>
            {connected ? "realtime" : "offline"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            Customer: <b>{customer?.name ?? "—"}</b> <span className="text-xs text-muted-foreground">{customer?.customer_code} · {customer?.tier}</span>
          </span>
          <span>Specialist: <b>{cs.specialist ?? "—"}</b></span>
          <span>Confidence: <b>{confidenceLabel(cs.routing_confidence)}</b></span>
          <span className={classNames("font-medium", sla.critical ? "text-danger" : "text-muted-foreground")}>
            SLA: {sla.text}
          </span>
        </div>
        <div className="mt-2 rounded bg-card px-3 py-2 text-[13px]">{cs.message_text ?? "—"}</div>
        {cs.contradiction_detected && (
          <div className="mt-3 flex items-start gap-2 rounded border border-danger/40 bg-card px-3 py-2.5">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="text-[13px]">
              <div className="font-semibold text-danger">CONTRADICTION DETECTED</div>
              {asArray(cs.contradictions).map((c, i) => (
                <div key={i} className="mt-1">
                  <div className="font-medium">{c.label}</div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {c.evidence.map((ev, j) => (
                      <span key={j} className="rounded bg-muted px-1.5 py-0.5">{ev.source} → {ev.value}</span>
                    ))}
                  </div>
                  <div className="mt-0.5 text-xs font-semibold text-danger">{c.decision}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {cs.circuit_breaker?.tripped && (
          <div className="mt-2 flex items-center gap-2 rounded border border-warning/50 bg-warning-soft/50 px-3 py-2 text-[13px]">
            <PauseCircle className="h-4 w-4 text-warning" />
            <span>
              <b>AUTOMATION PAUSED</b> — {cs.circuit_breaker.reason ?? "repeated action failure"} ({cs.circuit_breaker.attempts} attempts / limit {cs.circuit_breaker.limit})
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Left: understanding + pipeline */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">AI Understanding</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 p-4 text-[13px]">
              <KV k="Intent" v={cs.intent ?? "—"} />
              <KV k="Sub-intents" v={asArray(cs.sub_intents).join(", ") || "—"} />
              <KV k="Urgency" v={cs.urgency ?? "—"} />
              <KV k="Sentiment" v={cs.sentiment ?? "—"} />
              <KV k="Priority" v={cs.priority ?? "—"} />
              <KV k="Confidence" v={confidenceLabel(cs.routing_confidence)} />
              <div className="col-span-2">
                <div className="mb-1 text-xs text-muted-foreground">Routing confidence</div>
                <ConfidenceBar value={cs.routing_confidence} />
              </div>
              <div className="col-span-2 text-xs text-muted-foreground">
                {cs.routing_reason ?? "—"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Investigation Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <InvestigationTimeline
                events={(events ?? []) as CaseEvent[]}
                running={investigating}
              />
            </CardContent>
          </Card>

          <CaseEffortCard caseRow={cs} escalated={Boolean(escalation)} />

          <DecisionTrace caseRow={cs} />
          <ActionPreview caseRow={cs} />
          <UncertaintyPanel caseRow={cs} />
          <SLAIntelligence caseRow={cs} />
          <InvestigationReplay events={(events ?? []) as CaseEvent[]} />
        </div>

        {/* Right: evidence + gates + action */}
        <div className="space-y-4 xl:col-span-2">
          <EvidencePanel evidence={asArray(cs.evidence) as CaseRow["evidence"]} />
          <ContradictionMatrix contradictions={asArray(cs.contradictions) as CaseRow["contradictions"]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <HypothesisPanel caseRow={cs} />
            <GateStatus gates={(cs.gates ?? {}) as Record<string, never>} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RAGSources sources={ragSources} />
            <RAGQuality caseRow={cs} sources={ragSources} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <VerificationPanel verification={normalizeVerification(cs.verification_result)} />
            <VerificationCenter caseRow={cs} />
          </div>
          <BreakerMonitor caseRow={cs} />

          {staffRole && (
            <>
              <ApprovalPanel caseRow={cs} customerTier={customer?.tier ?? "standard"} />
              <SimulationPanel customerTier={customer?.tier ?? "standard"} evidenceSources={[...new Set(asArray(cs.evidence).map((e) => e.source))]} />
            </>
          )}

          {escalation && (
            <div className="grid gap-4 lg:grid-cols-2">
              <EscalationPanel escalation={escalation} caseRow={cs} />
              {escalation.passport && Object.keys(escalation.passport).length > 0 && (
                <ResolutionPassport passport={escalation.passport} />
              )}
            </div>
          )}

          {/* Action panel (staff) */}
          {staffRole && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Action Engine</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="mb-2 text-xs text-muted-foreground">
                  Staff-initiated actions pass through the four-gate controller before execution.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={acting !== null || cs.status === "resolved"} onClick={() => void runAction("issue_refund", { payment_txn: asArray(cs.transaction_ids)[0] })}>
                    <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> Refund
                  </Button>
                  <Button size="sm" variant="outline" disabled={acting !== null} onClick={() => void runAction("update_ticket", { note: "Specialist review in progress" })}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Update ticket
                  </Button>
                  <Button size="sm" variant="outline" disabled={acting !== null} onClick={() => void api.escalate(cs.id).then((r) => alert(`Escalated (${r.score}/100)\n${r.reasons.join("\n")}`)).then(() => queryClient.invalidateQueries())}>
                    Escalate
                  </Button>
                  <div className="ml-auto flex w-72 items-center gap-2">
                    <input
                      value={messageNote}
                      onChange={(e) => setMessageNote(e.target.value)}
                      placeholder="Message to customer…"
                      className="h-8 flex-1 rounded-md border bg-background px-2 text-[13px]"
                    />
                    <Button size="sm" onClick={() => void sendMessage()} disabled={acting !== null || !messageNote.trim()}>
                      <Send className="mr-1 h-3.5 w-3.5" /> Send
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {cs.resolution_passport && Object.keys(cs.resolution_passport).length > 0 && (
            <ResolutionPassport passport={cs.resolution_passport} />
          )}

          <HandoffSummary caseRow={cs} events={(events ?? []) as CaseEvent[]} />
          <KnowledgeCandidates caseRow={cs} />

          <AuditTimeline logs={audit ?? []} limit={12} />
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded border bg-muted/30 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="truncate text-[13px] font-medium">{v}</div>
    </div>
  );
}

function CaseEffortCard({ caseRow, escalated }: { caseRow: CaseRow; escalated: boolean }) {
  const repeatContacts = Number((caseRow.customer_history as Record<string, unknown>)?.repeat_contacts ?? 0);
  const failedActions = asArray(caseRow.action_history).filter((a) => a.status === "failed").length;
  const resolved = caseRow.status === "resolved";
  const resolutionHours = resolved && caseRow.updated_at
    ? Math.max(1, (new Date(caseRow.updated_at).getTime() - new Date(caseRow.created_at).getTime()) / 3600000)
    : 1;
  const r = computeCustomerEffort({
    contacts: 1 + repeatContacts,
    transfers: escalated ? 1 : 0,
    infoRequests: /status|update|when|how long|still|pending/i.test(caseRow.message_text ?? "") ? 1 : 0,
    resolutionHours,
    failedActions,
    escalations: escalated ? 1 : 0,
  });
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center justify-between text-sm">
          Customer Effort (this case)
          <span className={`text-base font-bold ${r.score >= 3.6 ? "text-danger" : r.score >= 2.6 ? "text-warning" : "text-success"}`}>
            {r.score.toFixed(1)} / 5
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 p-4 text-xs">
        {r.factors.map((f) => (
          <div key={f.name} className="flex items-center justify-between rounded bg-muted/30 px-2 py-1">
            <span className="text-muted-foreground">{f.name}</span>
            <span className="font-medium">{f.detail}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
