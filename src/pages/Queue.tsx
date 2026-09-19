import { useMemo, useState } from "react";
import { useCustomers, useCases } from "@/hooks/useData";
import { CaseTable, filterCases, type QueueFilters } from "@/components/case-table";
import { PageHeader, TableSkeleton, EmptyState } from "@/components/widgets";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Filter, RotateCcw } from "lucide-react";
import type { Customer } from "@/lib/types";

const EMPTY_FILTERS: QueueFilters = {};

export default function Queue() {
  const { data: cases, isLoading, isError, refetch } = useCases();
  const { data: customers } = useCustomers();
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_FILTERS);

  const customerMap = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers ?? []) m.set(c.id, c as Customer);
    return m;
  }, [customers]);

  const filtered = useMemo(
    () => filterCases(cases ?? [], filters),
    [cases, filters],
  );

  return (
    <div>
      <PageHeader
        title="Complaint Queue"
        subtitle={`${filtered.length} cases match · ${(cases ?? []).length} total`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={filters.intent ?? ""}
          onChange={(e) => setFilters({ ...filters, intent: e.target.value || null })}
          className="h-9 rounded-md border bg-background px-2 text-[13px]"
        >
          <option value="">All intents</option>
          {["billing", "order", "technical", "account"].map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <select
          value={filters.priority ?? ""}
          onChange={(e) => setFilters({ ...filters, priority: e.target.value || null })}
          className="h-9 rounded-md border bg-background px-2 text-[13px]"
        >
          <option value="">All priorities</option>
          {["P1", "P2", "P3", "P4"].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={filters.sentiment ?? ""}
          onChange={(e) => setFilters({ ...filters, sentiment: e.target.value || null })}
          className="h-9 rounded-md border bg-background px-2 text-[13px]"
        >
          <option value="">All sentiment</option>
          {["negative", "neutral", "positive"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filters.status ?? ""}
          onChange={(e) => setFilters({ ...filters, status: e.target.value || null })}
          className="h-9 rounded-md border bg-background px-2 text-[13px]"
        >
          <option value="">All statuses</option>
          {["new", "investigating", "action_required", "verifying", "resolved", "escalated", "automation_paused", "closed"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={filters.escalated ?? false}
            onChange={(e) => setFilters({ ...filters, escalated: e.target.checked || null })}
          />
          Escalated
        </label>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={filters.slaRisk ?? false}
            onChange={(e) => setFilters({ ...filters, slaRisk: e.target.checked || null })}
          />
          SLA at risk
        </label>
        <Input
          placeholder="Search case / issue"
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
          className="h-9 w-52"
        />
        <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : isError ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-danger/30 bg-danger-soft/20 p-6 text-center">
          <div className="text-sm font-semibold">Unable to load the complaint queue</div>
          <div className="max-w-md text-xs text-muted-foreground">The case data could not be retrieved. Please try again.</div>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching cases" hint="Adjust the filters or reset them." />
      ) : (
        <CaseTable cases={filtered} customers={customerMap} />
      )}
    </div>
  );
}
