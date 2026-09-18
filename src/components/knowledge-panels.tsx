import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/panels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Lightbulb, TrendingUp, Users, FileText, CheckCircle2, XCircle } from "lucide-react";
import { fmtDate, timeAgo, classNames, inr } from "@/lib/format";
import { asArray } from "@/lib/verification";
import { computeTrend } from "@/lib/engine";
import type { CaseRow, KnowledgeCandidate, Customer, Incident } from "@/lib/types";

// ---------------------------------------------------------------------
// 10. Knowledge / RAG Quality Panel
// ---------------------------------------------------------------------
export function RAGQuality({ caseRow, sources }: { caseRow: CaseRow; sources?: { doc_id: string; title: string; score: number; source?: string; policyId?: string }[] }) {
  const items = sources ?? [];
  const grounded = items.length > 0;
  const unsupported = !grounded && Boolean((caseRow.policy_result as Record<string, unknown>)?.allowed);
  return (
    <SectionCard
      title="Knowledge / RAG Quality"
      icon={<BookOpen className="h-4 w-4 text-info" />}
      action={<Badge className={grounded ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}>{grounded ? "Grounded" : "Unsupported"}</Badge>}
    >
      {grounded ? (
        <div className="space-y-1.5">
          {items.map((s, i) => (
            <div key={i} className="rounded border px-2.5 py-1.5 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{s.title}</span>
                <span className="text-xs text-muted-foreground">score {s.score.toFixed(3)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>Doc: {s.doc_id}</span>
                {s.source && <span>Source: {s.source}</span>}
                <span>Freshness: n/a (static KB)</span>
                <span>Grounding: <b className={classNames(grounded ? "text-success" : "text-warning")}>{grounded ? "OK" : "MISSING"}</b></span>
              </div>
            </div>
          ))}
          <div className="text-[11px] text-muted-foreground">
            Policy consulted: <b>{String((caseRow.policy_result as Record<string, unknown>)?.policy_id ?? "none")}</b>
          </div>
        </div>
      ) : (
        <div className="rounded border border-warning/40 bg-warning-soft/40 px-2.5 py-2 text-xs">
          <b className="text-warning">Insufficient trusted knowledge</b> — no knowledge document matched this issue.
          {unsupported && <div className="mt-1 text-muted-foreground">Unsupported policy claims are prevented: policy decisions still require a governing policy row.</div>}
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 11. Knowledge Feedback Loop
// ---------------------------------------------------------------------
export function KnowledgeCandidates({ caseRow }: { caseRow: CaseRow }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["knowledge-candidates"],
    queryFn: () => api.knowledgeCandidates("list"),
  });
  const candidates = (data?.candidates ?? []) as KnowledgeCandidate[];

  const create = async () => {
    setBusy("create");
    try {
      await api.knowledgeCandidates("create", { case_id: caseRow.id, resolution: `Resolved by human review — ${caseRow.root_cause ?? "manual investigation"}` });
      await qc.invalidateQueries({ queryKey: ["knowledge-candidates"] });
    } finally {
      setBusy(null);
    }
  };

  const review = async (id: string, decision: "approved" | "rejected") => {
    setBusy(id);
    try {
      await api.knowledgeCandidates("review", { id, decision });
      await qc.invalidateQueries({ queryKey: ["knowledge-candidates"] });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard title="Knowledge Feedback Loop" icon={<Lightbulb className="h-4 w-4 text-warning" />}>
      <div className="mb-2 text-[11px] text-muted-foreground">
        AI-generated knowledge is never added to the trusted base automatically — a human must approve it.
      </div>
      {caseRow.status === "resolved" && (
        <Button size="sm" variant="outline" onClick={() => void create()} disabled={busy !== null}>
          Generate Knowledge Candidate from this case
        </Button>
      )}
      <div className="mt-3 space-y-1.5">
        {candidates.map((c) => (
          <div key={c.id} className="rounded border px-2.5 py-1.5 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{c.problem}</div>
                <div className="text-[11px] text-muted-foreground">
                  root cause: {c.root_cause ?? "—"} · confidence {Math.round(c.confidence * 100)}% · {timeAgo(c.created_at)}
                </div>
              </div>
              <Badge className={c.status === "approved" ? "bg-success-soft text-success" : c.status === "rejected" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}>
                {c.status}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{c.resolution}</div>
            {c.status === "pending" && (
              <div className="mt-1.5 flex gap-2">
                <Button size="sm" variant="outline" className="h-7 bg-success text-success-foreground" onClick={() => void review(c.id, "approved")} disabled={busy !== null}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve to Knowledge Base
                </Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => void review(c.id, "rejected")} disabled={busy !== null}>
                  <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            )}
          </div>
        ))}
        {candidates.length === 0 && <div className="text-xs text-muted-foreground">No knowledge candidates yet.</div>}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 12. Recurring / Emerging issue detection
// ---------------------------------------------------------------------
export function TrendsPanel({
  fingerprints,
  cases,
}: {
  fingerprints?: { fingerprint_id: string; name: string; frequency: number; severity: string; affected_system: string }[];
  cases: CaseRow[];
}) {
  const fps = fingerprints ?? [];
  const caseList = cases ?? [];
  const now = Date.now();
  const recent = caseList.filter((c) => now - new Date(c.created_at).getTime() < 7 * 86400000);
  const older = caseList.filter((c) => now - new Date(c.created_at).getTime() >= 7 * 86400000);

  const rows = fps.map((fp) => {
    const matcher = (c: CaseRow) => {
      const ev = asArray<unknown>(c.evidence);
      return (
        (c.root_cause ?? "").toLowerCase().includes(fp.name.split(" ")[0].toLowerCase()) ||
        ev.some((e) => String((e as { label?: string }).label ?? "").toLowerCase().includes(fp.name.split(" ")[0].toLowerCase())) ||
        ev.some((e) => String((e as { type?: string }).type ?? "").includes(fp.affected_system)) ||
        (c.intent === "billing" && fp.fingerprint_id === "FP-01")
      );
    };
    const cur = recent.filter(matcher);
    const base = older.filter(matcher);
    const customers = new Set<string>();
    for (const c of [...cur, ...base]) customers.add(c.customer_id);
    return {
      fp,
      current: cur.length,
      baseline: base.length,
      change: base.length > 0 ? Math.round(((cur.length - base.length) / base.length) * 100) : cur.length > 0 ? 100 : 0,
      affectedCustomers: customers.size,
      relatedCases: cur.length + base.length,
      systems: fp.affected_system,
      potentialIncident: cur.length >= 3 && cur.length > base.length,
    };
  });

  return (
    <SectionCard title="Recurring & Emerging Issue Detection" icon={<TrendingUp className="h-4 w-4 text-brand" />}>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.fp.fingerprint_id} className="rounded border px-2.5 py-1.5 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-medium">{r.fp.name}</span>
              {r.potentialIncident && <Badge className="bg-danger-soft text-danger">Potential incident</Badge>}
              {r.change >= 40 && !r.potentialIncident && <Badge className="bg-warning-soft text-warning">Emerging +{r.change}%</Badge>}
              {r.change <= -25 && <Badge className="bg-success-soft text-success">Declining {r.change}%</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
              <span>Current: <b>{r.current}</b></span>
              <span>Baseline: <b>{r.baseline}</b></span>
              <span>Change: <b>{r.change >= 0 ? "+" : ""}{r.change}%</b></span>
              <span>Affected customers: <b>{r.affectedCustomers}</b></span>
              <span>Related cases: <b>{r.relatedCases}</b></span>
              <span>Systems: <b>{r.systems}</b></span>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-xs text-muted-foreground">No fingerprints to trend.</div>}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 13. Proactive Customer Impact View
// ---------------------------------------------------------------------
export function ImpactPanel({
  incident,
  cases,
  customers,
}: {
  incident: Incident;
  cases: CaseRow[];
  customers?: Map<string, Customer>;
}) {
  const custMap = customers ?? new Map<string, Customer>();
  const qc = useQueryClient();
  const [notified, setNotified] = useState(false);
  const linked = (incident.linked_case_uuids ?? []).filter((id) => cases.some((c) => c.id === id));
  const affected = linked.map((cid) => {
    const c = (cases ?? []).find((x) => x.id === cid);
    return { c, cust: c ? custMap.get(c.customer_id) : undefined };
  }).filter((x) => x.c && x.cust);

  const prepareNotification = async () => {
    const { error } = await supabase.from("resolveai_analytics_events").insert({
      customer_id: null,
      case_id: null,
      event_type: "notification_prepared",
      payload: { incident_id: incident.incident_id, prepared_for: affected.length },
    });
    if (!error) {
      setNotified(true);
      await qc.invalidateQueries();
    }
  };

  return (
    <div className="rounded-md border border-danger/30 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Users className="h-4 w-4 text-danger" /> {incident.incident_id} — Proactive Customer Impact
        </div>
        <Button size="sm" variant="outline" className="h-7" onClick={() => void prepareNotification()} disabled={notified}>
          {notified ? "Notification prepared" : "Prepare Customer Notification"}
        </Button>
      </div>
      <div className="mt-2 space-y-1.5">
        {affected.slice(0, 8).map(({ c, cust }) => (
          <div key={c!.id} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-xs">
            <span className="font-medium">{cust!.name}</span>
            <span className="text-muted-foreground">{cust!.customer_code}</span>
            <span className="text-muted-foreground">· order: {String(c!.transaction_ids?.[0] ?? c!.order_ids?.[0] ?? "—")}</span>
            <span className="text-muted-foreground">· case: {c!.case_id}</span>
            <Badge className="ml-auto bg-brand-soft text-brand">{c!.status}</Badge>
          </div>
        ))}
        {affected.length === 0 && <div className="text-xs text-muted-foreground">No customers linked to this incident yet.</div>}
      </div>
      {notified && (
        <div className="mt-2 rounded bg-success-soft px-2 py-1.5 text-xs text-success">
          Notification draft recorded — no message sent automatically (authorization required first).
        </div>
      )}
    </div>
  );
}
