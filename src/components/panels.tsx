import {
  Database,
  User,
  Package,
  CreditCard,
  Ticket,
  BookOpen,
  ShieldCheck,
  Lightbulb,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Search,
  FileText,
  Scale,
} from "lucide-react";
import type { CaseRow, EvidenceItem, Hypothesis, GateResult, VerificationResult } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { classNames, confidenceLabel, timeAgo } from "@/lib/format";
import { GateBadge } from "@/components/badges";
import { normalizeVerification, asArray } from "@/lib/verification";

const SOURCE_ICON: Record<string, React.ReactNode> = {
  customers: <User className="h-3.5 w-3.5" />,
  orders: <Package className="h-3.5 w-3.5" />,
  payments: <CreditCard className="h-3.5 w-3.5" />,
  tickets: <Ticket className="h-3.5 w-3.5" />,
  knowledge: <BookOpen className="h-3.5 w-3.5" />,
  policy: <Scale className="h-3.5 w-3.5" />,
};

export function SectionCard({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

export function EvidencePanel({ evidence }: { evidence: EvidenceItem[] }) {
  const items = asArray<EvidenceItem>(evidence);
  const facts = items.filter((e) => e.known);
  const inferences = items.filter((e) => !e.known);
  return (
    <SectionCard
      title="Evidence"
      icon={<Database className="h-4 w-4 text-brand" />}
      action={
        <span className="text-xs text-muted-foreground">
          {facts.length} facts · {inferences.length} inferences
        </span>
      }
    >
      <div className="space-y-1.5">
        {facts.map((e) => (
          <div key={e.id} className="flex items-start gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-[13px]">
            <span className="mt-0.5 text-muted-foreground">{SOURCE_ICON[e.source] ?? <Database className="h-3.5 w-3.5" />}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{e.label}</div>
              {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-success">FACT</span>
          </div>
        ))}
        {inferences.map((e) => (
          <div key={e.id} className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft/50 px-2.5 py-1.5 text-[13px]">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 text-warning" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{e.label}</div>
              {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-warning">INFERRED</span>
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-muted-foreground">No evidence collected yet.</div>}
      </div>
    </SectionCard>
  );
}

export function HypothesisPanel({ caseRow }: { caseRow: CaseRow }) {
  const hyps: Hypothesis[] = caseRow.hypotheses ?? [];
  return (
    <SectionCard title="Root Cause & Hypotheses" icon={<Lightbulb className="h-4 w-4 text-warning" />}>
      <div className="mb-3 flex items-center gap-2">
        <div className="text-sm font-medium">Root cause:</div>
        <div className="text-sm">{caseRow.root_cause ?? "Not determined"}</div>
        {caseRow.root_cause_confidence != null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
            {confidenceLabel(caseRow.root_cause_confidence)}
          </span>
        )}
      </div>
      <Separator className="mb-3" />
      <div className="space-y-2">
        {hyps.map((h, i) => (
          <div key={i} className="rounded-md border px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-medium">{h.title}</div>
              <span className="text-xs font-medium text-muted-foreground">{confidenceLabel(h.confidence)}</span>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{h.reasoning}</div>
          </div>
        ))}
        {hyps.length === 0 && <div className="text-xs text-muted-foreground">No hypotheses generated.</div>}
      </div>
    </SectionCard>
  );
}

export function GateStatus({ gates }: { gates: Record<string, GateResult> }) {
  const list = Object.values(gates ?? {});
  return (
    <SectionCard title="Four-Gate Controller" icon={<ShieldCheck className="h-4 w-4 text-success" />}>
      <div className="grid gap-2">
        {list.map((g) => (
          <div key={g.name} className="rounded-md border px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-medium">{g.name}</div>
              <GateBadge status={g.status} />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{g.detail}</div>
            <div className="mt-1.5 space-y-0.5">
              {g.checks.map((c) => (
                <div key={c.name} className="flex items-center gap-1.5 text-xs">
                  {c.pass ? (
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  ) : (
                    <XCircle className="h-3 w-3 text-danger" />
                  )}
                  <span className="text-muted-foreground">{c.detail}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-xs text-muted-foreground">Gates not yet evaluated.</div>}
      </div>
    </SectionCard>
  );
}

export function VerificationPanel({ verification }: { verification: VerificationResult | null }) {
  const norm = normalizeVerification(verification);
  if (!norm) {
    return (
      <SectionCard title="Action Verification" icon={<Loader2 className="h-4 w-4 text-info" />}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {verification == null
            ? "Awaiting verification…"
            : "No verification events available yet."}
        </div>
      </SectionCard>
    );
  }
  const { overall, checks, detail } = norm;
  const tone = overall === "passed" ? "success" : overall === "failed" ? "danger" : "warning";
  const Icon = overall === "passed" ? CheckCircle2 : overall === "failed" ? XCircle : AlertTriangle;
  return (
    <SectionCard
      title="Action Verification"
      icon={<Icon className={`h-4 w-4 text-${tone}`} />}
      action={
        <span
          className={classNames(
            "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase",
            tone === "success" && "bg-success-soft text-success",
            tone === "danger" && "bg-danger-soft text-danger",
            tone === "warning" && "bg-warning-soft text-warning",
          )}
        >
          {overall}
        </span>
      }
    >
      <div className="space-y-1.5">
        {checks.map((c) => (
          <div key={c.name} className="flex items-center justify-between rounded-md border bg-muted/30 px-2.5 py-1.5 text-[13px]">
            <span className="font-medium">{c.name}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {c.pass ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-danger" />}
              {String(c.actual ?? "—")}
            </span>
          </div>
        ))}
        {checks.length === 0 && (
          <div className="text-xs text-muted-foreground">No verification checks recorded.</div>
        )}
        {detail && <div className="pt-1 text-xs text-muted-foreground">{detail}</div>}
      </div>
    </SectionCard>
  );
}

export function RAGSources({ sources }: { sources: { doc_id: string; title: string; score: number; section?: string }[] }) {
  const items = asArray<{ doc_id: string; title: string; score: number; section?: string }>(sources);
  return (
    <SectionCard title="Retrieved Knowledge (RAG)" icon={<Search className="h-4 w-4 text-info" />}>
      <div className="space-y-1.5">
        {items.map((s, i) => (
          <div key={i} className="rounded-md border px-2.5 py-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[13px] font-medium">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                {s.title}
              </div>
              <span className="text-xs font-medium text-muted-foreground">{s.score.toFixed(3)}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{s.doc_id}</span>
              <span>Relevance score</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-muted-foreground">No knowledge documents matched.</div>}
      </div>
    </SectionCard>
  );
}

export function ConfidenceBar({ value }: { value: number | null }) {
  if (value == null) return null;
  const tone = value >= 0.7 ? "bg-success" : value >= 0.55 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <Progress value={Math.round(value * 100)} className={classNames("h-1.5", tone)} />
      <span className="text-xs font-medium">{confidenceLabel(value)}</span>
    </div>
  );
}

export function ActivityStamp({ iso }: { iso: string }) {
  return <span className="text-[11px] text-muted-foreground">{timeAgo(iso)}</span>;
}
