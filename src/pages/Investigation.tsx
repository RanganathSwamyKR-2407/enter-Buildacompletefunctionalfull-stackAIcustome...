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

export default function Investigation() {
  const { caseId } = useParams<{ caseId: string }>();
  const { staffRole } = useAuth();
  const queryClient = useQueryClient();

  const { data: staticCase } = useQuery({
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

  if (!cs) return <LoadingState label="Loading case…" />;

  const sla = slaRemaining(cs.sla_deadline);
  const investigating = cs.status === "investigating" || cs.status === "verifying" || cs.status === "action_required";
  const ragSources = ((cs.evidence ?? []).filter((e) => e.source === "knowledge")).map((e) => ({
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
      alert(`${res.ok ? "Action executed" : "Action blocked"}\n${JSON.stringify(res.result ?? res.gates, null, 2)}`);
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
              {(cs.contradictions ?? []).map((c, i) => (
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
              <KV k="Sub-intents" v={(cs.sub_intents ?? []).join(", ") || "—"} />
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
        </div>

        {/* Right: evidence + gates + action */}
        <div className="space-y-4 xl:col-span-2">
          <EvidencePanel evidence={(cs.evidence ?? []) as CaseRow["evidence"]} />
          <div className="grid gap-4 lg:grid-cols-2">
            <HypothesisPanel caseRow={cs} />
            <GateStatus gates={(cs.gates ?? {}) as Record<string, never>} />
          </div>
          <RAGSources sources={ragSources} />
          <VerificationPanel verification={cs.verification_result} />

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
                  <Button size="sm" variant="outline" disabled={acting !== null || cs.status === "resolved"} onClick={() => void runAction("issue_refund", { payment_txn: (cs.transaction_ids ?? [])[0] })}>
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
