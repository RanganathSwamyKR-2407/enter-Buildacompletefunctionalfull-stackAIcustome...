import { Link } from "react-router-dom";
import type { CaseRow, Customer } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, PriorityBadge, IntentBadge, SentimentIndicator, EscalationBadge } from "@/components/badges";
import { slaRemaining, fmtDate, classNames } from "@/lib/format";

export interface QueueFilters {
  intent?: string | null;
  priority?: string | null;
  sentiment?: string | null;
  status?: string | null;
  escalated?: boolean | null;
  slaRisk?: boolean | null;
  search?: string;
}

export function filterCases(cases: CaseRow[], f: QueueFilters): CaseRow[] {
  return cases.filter((c) => {
    if (f.intent && c.intent !== f.intent) return false;
    if (f.priority && c.priority !== f.priority) return false;
    if (f.sentiment && c.sentiment !== f.sentiment) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.escalated && c.status !== "escalated") return false;
    if (f.slaRisk) {
      const sla = slaRemaining(c.sla_deadline);
      if (!c.sla_deadline || !sla.critical) return false;
    }
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${c.case_id} ${c.message_text ?? ""} ${c.root_cause ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function CaseTable({
  cases,
  customers,
}: {
  cases: CaseRow[];
  customers: Map<string, Customer>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-20">Case</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead className="max-w-[220px]">Issue</TableHead>
            <TableHead>Intent</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Sentiment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Escalation</TableHead>
            <TableHead>SLA</TableHead>
            <TableHead>Last activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((c) => {
            const cust = customers.get(c.customer_id);
            const sla = slaRemaining(c.sla_deadline);
            const rowCls = classNames(
              c.status === "escalated" && "bg-danger-soft/40",
              c.status === "automation_paused" && "bg-warning-soft/40",
            );
            return (
              <TableRow key={c.id} className={rowCls}>
                <TableCell>
                  <Link to={`/investigations/${c.id}`} className="font-medium text-brand hover:underline">
                    {c.case_id}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="text-[13px] font-medium">{cust?.name ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{cust?.customer_code}</div>
                </TableCell>
                <TableCell className="max-w-[220px]">
                  <div className="truncate text-[13px]" title={c.message_text ?? ""}>
                    {c.message_text}
                  </div>
                </TableCell>
                <TableCell>
                  <IntentBadge intent={c.intent} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={c.priority} />
                </TableCell>
                <TableCell>
                  <SentimentIndicator sentiment={c.sentiment} score={c.sentiment_score} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell>
                  <EscalationBadge score={c.escalation_score} />
                </TableCell>
                <TableCell>
                  <span className={classNames("text-xs font-medium", sla.critical ? "text-danger" : "text-muted-foreground")}>
                    {sla.text}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.updated_at)}</TableCell>
              </TableRow>
            );
          })}
          {cases.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                No cases match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
