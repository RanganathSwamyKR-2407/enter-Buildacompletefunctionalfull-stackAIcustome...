import { Package, CreditCard, Ticket as TicketIcon, FileText, Activity, CheckCircle2, LifeBuoy } from "lucide-react";
import type { Customer, Order, Payment, Refund, Ticket, CaseRow, Escalation } from "@/lib/types";
import { SectionCard } from "@/components/panels";
import { Badge } from "@/components/ui/badge";
import { classNames, fmtDate, inr } from "@/lib/format";
import { computeCustomerEffort, type EffortResult } from "@/lib/engine";
import { asArray } from "@/lib/verification";

// ---------------------------------------------------------------------
// 5. Customer Effort Score — computed from actual records
// ---------------------------------------------------------------------
export function EffortScore({ tickets, cases, escalations, refunds }: {
  tickets: Ticket[];
  cases: CaseRow[];
  escalations: Escalation[];
  refunds: Refund[];
}) {
  const ticketList = tickets ?? [];
  const caseList = cases ?? [];
  const escList = escalations ?? [];
  const refundList = refunds ?? [];
  const resolved = caseList.filter((c) => c.status === "resolved" || c.closed_at);
  const resolutionHours = resolved.length
    ? resolved.reduce((n, c) => n + (c.closed_at ? (new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 3600000 : 0), 0) / resolved.length
    : 0;
  const infoRequests = caseList.filter((c) => /status|update|when|how long|still|pending/i.test(c.message_text ?? "")).length;
  const failedActions = caseList.reduce((n, c) => n + asArray(c.action_history).filter((a) => a.status === "failed").length, 0);
  const result: EffortResult = computeCustomerEffort({
    contacts: ticketList.length + caseList.length,
    transfers: escList.length,
    infoRequests,
    resolutionHours,
    failedActions,
    escalations: escList.length,
  });
  const tone = result.score >= 3.6 ? "danger" : result.score >= 2.6 ? "warning" : "success";
  return (
    <SectionCard
      title="Customer Effort Score"
      action={<span className={classNames("text-lg font-bold", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-success")}>{result.score.toFixed(1)} / 5</span>}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <Badge className={tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}>{result.label}</Badge>
        <span className="text-[11px] text-muted-foreground">Computed from {ticketList.length + caseList.length} contacts · {refundList.length} refunds</span>
      </div>
      <div className="space-y-1 text-xs">
        {result.factors.map((f) => (
          <div key={f.name} className="flex items-center justify-between rounded bg-muted/30 px-2 py-1">
            <span className="text-muted-foreground">{f.name}</span>
            <span className="font-medium">{f.detail}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 4. Customer Journey Timeline — reconstructed from real records
// ---------------------------------------------------------------------
type JourneyItem = {
  id: string;
  kind: "order" | "payment" | "refund" | "ticket" | "case" | "escalation" | "resolution";
  label: string;
  time: string;
  status: string;
  icon: React.ReactNode;
};

export function CustomerJourney({
  orders,
  payments,
  refunds,
  tickets,
  cases,
  escalations,
}: {
  orders: Order[];
  payments: Payment[];
  refunds: Refund[];
  tickets: Ticket[];
  cases: CaseRow[];
  escalations: Escalation[];
}) {
  const items: JourneyItem[] = [
    ...(orders ?? []).map((o) => ({
      id: o.id,
      kind: "order" as const,
      label: `Order ${o.order_id} — ${o.status}`,
      time: o.created_at,
      status: o.status,
      icon: <Package className="h-3.5 w-3.5 text-brand" />,
    })),
    ...(payments ?? []).map((p) => ({
      id: p.id,
      kind: "payment" as const,
      label: `Payment ${p.txn_id} — ${inr(p.amount)} (${p.status})`,
      time: p.created_at,
      status: p.status,
      icon: <CreditCard className="h-3.5 w-3.5 text-info" />,
    })),
    ...(refunds ?? []).map((r) => ({
      id: r.id,
      kind: "refund" as const,
      label: `Refund ${r.refund_id} — ${inr(r.amount)} (${r.status})`,
      time: r.created_at,
      status: r.status,
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
    })),
    ...(tickets ?? []).map((t) => ({
      id: t.id,
      kind: "ticket" as const,
      label: `Support contact ${t.ticket_id} — ${t.subject}`,
      time: t.created_at,
      status: t.status,
      icon: <TicketIcon className="h-3.5 w-3.5 text-warning" />,
    })),
    ...(cases ?? []).map((c) => ({
      id: c.id,
      kind: "case" as const,
      label: `Complaint ${c.case_id} — ${c.intent}`,
      time: c.created_at,
      status: c.status,
      icon: <FileText className="h-3.5 w-3.5 text-danger" />,
    })),
    ...(escalations ?? []).map((e) => ({
      id: e.id,
      kind: "escalation" as const,
      label: `Escalation ${e.case_id.slice(0, 8)} — score ${e.score}`,
      time: e.created_at,
      status: "escalated",
      icon: <LifeBuoy className="h-3.5 w-3.5 text-danger" />,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <SectionCard title="Customer Journey Timeline" icon={<Activity className="h-4 w-4 text-brand" />}>
      <div className="max-h-[420px] space-y-0 overflow-y-auto pr-1">
        {items.map((item, i) => (
          <div key={item.id + i} className="relative flex gap-3 pb-3">
            {i < items.length - 1 && <span className="absolute left-[8px] top-5 h-full w-px bg-border" />}
            <span className="mt-1">{item.icon}</span>
            <div className="min-w-0 flex-1 rounded-md border bg-muted/20 px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium">{item.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(item.time)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">status: {item.status}</div>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-muted-foreground">No activity recorded for this customer.</div>}
      </div>
    </SectionCard>
  );
}
