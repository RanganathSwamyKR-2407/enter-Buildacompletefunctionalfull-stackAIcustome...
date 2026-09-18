import { User, Package, CreditCard, Ticket, RefreshCw, TrendingDown } from "lucide-react";
import type { Customer, Order, Payment, Refund, Ticket, CaseRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate, timeAgo, pct } from "@/lib/format";
import { StatusBadge, SentimentIndicator } from "@/components/badges";

const TIER_TONE: Record<string, string> = {
  gold: "bg-warning-soft text-warning",
  premium: "bg-brand-soft text-brand",
  standard: "bg-muted text-muted-foreground",
};

export function Customer360({
  customer,
  orders,
  payments,
  refunds,
  tickets,
  cases,
}: {
  customer: Customer;
  orders: Order[];
  payments: Payment[];
  refunds: Refund[];
  tickets: Ticket[];
  cases: CaseRow[];
}) {
  const openCases = cases.filter((c) => c.status !== "resolved" && c.status !== "closed");
  const negCases = cases.filter((c) => c.sentiment === "negative");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-base font-bold text-brand-foreground">
              {customer.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{customer.name}</h2>
                <Badge className={TIER_TONE[customer.tier] ?? ""}>{customer.tier}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {customer.customer_code} · {customer.email} · {customer.city ?? "—"} · joined {fmtDate(customer.created_at)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
              <Metric label="Lifetime value" value={inr(customer.lifetime_value)} />
              <Metric label="Orders" value={String(customer.orders_count)} />
              <Metric label="Refunds" value={String(customer.refunds_count)} />
              <Metric label="Churn risk" value={pct(customer.churn_risk)} tone={customer.churn_risk >= 50 ? "danger" : "default"} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-brand" /> Orders ({orders.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-4">
            {orders.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[13px]">
                <div>
                  <div className="font-medium">{o.order_id}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {o.status} · {o.shipment_status ?? "—"} {o.courier ? `· ${o.courier}` : ""}
                  </div>
                </div>
                <div className="text-sm font-medium">{inr(o.amount)}</div>
              </div>
            ))}
            {orders.length === 0 && <Empty label="No orders" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4 text-brand" /> Payments ({payments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-4">
            {payments.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[13px]">
                <div>
                  <div className="font-medium">{p.txn_id}</div>
                  <div className="text-[11px] text-muted-foreground">{p.method} · {fmtDate(p.created_at)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{inr(p.amount)}</span>
                  <StatusDot status={p.status} />
                </div>
              </div>
            ))}
            {payments.length === 0 && <Empty label="No payments" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Ticket className="h-4 w-4 text-brand" /> Support history ({tickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-4">
            {tickets.slice(0, 6).map((t) => (
              <div key={t.id} className="rounded-md border px-2.5 py-1.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.subject}</span>
                  <span className="text-[11px] text-muted-foreground">{timeAgo(t.created_at)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t.ticket_id} · {t.category} · {t.status}
                </div>
              </div>
            ))}
            {tickets.length === 0 && <Empty label="No prior tickets" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-brand" /> Cases ({cases.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-4">
            {cases.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[13px]">
                <div className="min-w-0">
                  <div className="font-medium">{c.case_id} · {c.intent}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{c.message_text}</div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            ))}
            {cases.length === 0 && <Empty label="No cases" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" /> Repeat contacts
            </div>
            <div className="mt-1 text-2xl font-semibold">{tickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5" /> Negative sentiment cases
            </div>
            <div className="mt-1 text-2xl font-semibold text-danger">{negCases.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Open cases</div>
            <div className="mt-1 text-2xl font-semibold">{openCases.length}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${tone === "danger" ? "text-danger" : ""}`}>{value}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const tone =
    status === "succeeded" || status === "refunded"
      ? "bg-success"
      : status === "failed"
        ? "bg-danger"
        : status === "pending"
          ? "bg-warning"
          : "bg-muted-foreground";
  return <span className={`h-2 w-2 rounded-full ${tone}`} />;
}

function Empty({ label }: { label: string }) {
  return <div className="py-3 text-center text-xs text-muted-foreground">{label}</div>;
}

export { SentimentIndicator };
