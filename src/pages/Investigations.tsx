import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCases } from "@/hooks/useData";
import { useCustomers } from "@/hooks/useData";
import { PageHeader, TableSkeleton, EmptyState } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge, IntentBadge, SentimentIndicator } from "@/components/badges";
import { Activity, ArrowRight } from "lucide-react";
import { slaRemaining, fmtDate, classNames } from "@/lib/format";
import type { CaseRow, Customer } from "@/lib/types";

/**
 * Live Investigations hub: pick a case to open its live investigation
 * console. The console itself lives at /investigations/:caseId.
 */
export default function Investigations() {
  const { data: cases, isLoading } = useCases();
  const { data: customers } = useCustomers();

  const customerMap = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers ?? []) m.set(c.id, c as Customer);
    return m;
  }, [customers]);

  const active = (cases ?? [])
    .filter((c) => !["resolved", "closed"].includes(c.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const recent = (cases ?? [])
    .filter((c) => ["resolved", "closed"].includes(c.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const row = (c: CaseRow, i: number) => {
    const cust = customerMap.get(c.customer_id);
    const sla = slaRemaining(c.sla_deadline);
    return (
      <Link
        key={c.id}
        to={`/investigations/${c.id}`}
        className={classNames(
          "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-brand",
          i < active.length ? "" : "opacity-70",
        )}
      >
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand sm:flex">
          <Activity className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.case_id}</span>
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
            <IntentBadge intent={c.intent} />
            <SentimentIndicator sentiment={c.sentiment} score={c.sentiment_score} />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {cust?.name ?? "—"} · {c.message_text ?? ""}
          </div>
        </div>
        <div className="hidden shrink-0 text-right text-[11px] text-muted-foreground md:block">
          <div className={classNames("font-medium", sla.critical ? "text-danger" : "")}>{sla.text}</div>
          <div>{fmtDate(c.created_at)}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    );
  };

  return (
    <div>
      <PageHeader
        title="Live Investigations"
        subtitle="Open a case to watch its live investigation, evidence, gates and resolution stream in real time."
      />

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : (cases ?? []).length === 0 ? (
        <EmptyState title="No cases yet" hint="Send a complaint from Customer Chat to start an investigation." />
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active investigations ({active.length})
              </div>
              <div className="space-y-2">{active.slice(0, 12).map((c, i) => row(c, i))}</div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Completed ({recent.length})
              </div>
              <div className="space-y-2">{recent.slice(0, 6).map((c, i) => row(c, active.length + i))}</div>
            </div>
          )}
          {(cases ?? []).length > 18 && (
            <div className="text-center">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/queue">Open full complaint queue →</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
