import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCases, useCustomers } from "@/hooks/useData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge, IntentBadge, SentimentIndicator, EscalationBadge } from "@/components/badges";
import { SkeletonRows, EmptyState } from "@/components/widgets";
import {
  Activity,
  ArrowRight,
  Search,
  FileSearch,
  Scale,
  GitBranch,
  ShieldCheck,
  Zap,
  BadgeCheck,
  CheckCircle2,
  Landmark,
} from "lucide-react";
import { slaRemaining, classNames, inr } from "@/lib/format";
import type { CaseRow, Customer } from "@/lib/types";

const PIPELINE = [
  { label: "Complaint", sub: "Customer message understood", icon: Activity },
  { label: "Context", sub: "History, orders, previous contacts", icon: Landmark },
  { label: "Evidence", sub: "Real records from each source", icon: FileSearch },
  { label: "Root Cause", sub: "Hypothesis with confidence", icon: GitBranch },
  { label: "Policy", sub: "Business rules consulted", icon: Scale },
  { label: "Four Gates", sub: "Evidence · Policy · Authority · Risk", icon: ShieldCheck },
  { label: "Action", sub: "Permitted action executed", icon: Zap },
  { label: "Verification", sub: "Result independently confirmed", icon: BadgeCheck },
  { label: "Resolution", sub: "Resolved or escalated to human", icon: CheckCircle2 },
];

export default function Dashboard() {
  const { data: cases, isLoading } = useCases();
  const { data: customers } = useCustomers();

  const { data: analytics } = useQuery({
    queryKey: ["dashboard-analytics"],
    queryFn: () => api.analytics(),
    retry: false,
  });

  const customerMap = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers ?? []) m.set(c.id, c as Customer);
    return m;
  }, [customers]);

  const active = (cases ?? [])
    .filter((c) => !["resolved", "closed"].includes(c.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const featured = active[0] as CaseRow | undefined;
  const sla = slaRemaining(featured?.sla_deadline);
  const risk = (featured?.gates as Record<string, { status?: string }> | undefined)?.risk?.status;
  const a = analytics?.analytics;

  return (
    <div className="space-y-8">
      {/* Editorial hero */}
      <section className="border-b border-border/60 pb-8 animate-fade-in">
        <div className="max-w-3xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Command Center · Evidence before action
          </div>
          <h1 className="font-display text-[34px] font-medium leading-tight tracking-tight text-foreground md:text-[44px]">
            Customer support, with evidence behind every decision.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            ResolveAI investigates complaints across customer history, orders, payments,
            policies and operational signals before taking action — then verifies what it did.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="shadow-card">
            <Link to="/chat">
              <Search className="mr-2 h-4 w-4" /> Start Investigation
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/queue">
              View Complaint Queue <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* KPI strip (server-computed) */}
      {a && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          <Kpi label="Active complaints" value={a.operational.open_complaints} note={`${a.operational.total_cases} total`} />
          <Kpi label="SLA compliance" value={`${a.operational.sla_compliance_pct}%`} note="of resolved within deadline" />
          <Kpi label="Escalations" value={a.operational.escalated_count} note={`${a.operational.escalation_rate_pct}% of cases`} />
          <Kpi label="Automation success" value={`${a.operational.automation_success_rate_pct}%`} note="of executed actions verified" />
        </section>
      )}

      {/* Live operations */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Live Operations</h2>
          <Link to="/investigations" className="text-xs text-muted-foreground hover:text-foreground">
            All investigations →
          </Link>
        </div>
        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : featured ? (
          <Link to={`/investigations/${featured.id}`} className="group block rounded-xl border bg-card p-5 shadow-card transition-colors hover:border-brand">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-medium tracking-tight">{featured.case_id}</span>
                  <StatusBadge status={featured.status} />
                  <PriorityBadge priority={featured.priority} />
                  <IntentBadge intent={featured.intent} />
                  <SentimentIndicator sentiment={featured.sentiment} score={featured.sentiment_score} />
                  <EscalationBadge score={featured.escalation_score} />
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-foreground">{featured.message_text ?? "No message recorded."}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span>Customer: <b className="text-foreground">{customerMap.get(featured.customer_id)?.name ?? "—"}</b></span>
                  <span>Orders: {featured.order_ids?.length ?? 0}</span>
                  <span>Transactions: {featured.transaction_ids?.length ?? 0}</span>
                  <span className={classNames(sla.critical ? "text-danger" : "")}>SLA: {sla.text}</span>
                  {risk && <span>Risk gate: {risk}</span>}
                </div>
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-brand">
                Open investigation <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ) : (
          <EmptyState title="No active investigations" hint="Send a complaint from Customer Chat to start one." />
        )}
      </section>

      {/* Investigation pipeline */}
      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Investigation Pipeline</h2>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-9">
          {PIPELINE.map((stage, i) => {
            const to = featured ? `/investigations/${featured.id}` : "/chat";
            return (
              <Link
                key={stage.label}
                to={to}
                className="group rounded-lg border bg-card p-3 transition-colors hover:border-brand"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground/60">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <stage.icon className="h-3.5 w-3.5 text-brand" />
                </div>
                <div className="mt-2 text-[13px] font-medium leading-tight">{stage.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{stage.sub}</div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className="mt-1.5 font-display text-[28px] font-medium leading-none tracking-tight">{value}</div>
        {note && <div className="mt-1.5 text-xs text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}
