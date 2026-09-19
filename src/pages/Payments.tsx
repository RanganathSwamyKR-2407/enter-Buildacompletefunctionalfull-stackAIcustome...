import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePayments, useRefunds } from "@/hooks/useData";
import { PageHeader, TableSkeleton } from "@/components/widgets";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate } from "@/lib/format";
import type { Payment } from "@/lib/types";

const PAY_TONE: Record<string, string> = {
  succeeded: "bg-success-soft text-success",
  refunded: "bg-info-soft text-info",
  pending: "bg-warning-soft text-warning",
  failed: "bg-danger-soft text-danger",
};

const REFUND_TONE: Record<string, string> = {
  issued: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
  processing: "bg-warning-soft text-warning",
};

export default function Payments() {
  const { data: payments, isLoading } = usePayments();
  const { data: refunds } = useRefunds();

  const { data: refundMap } = useQuery({
    queryKey: ["payments-refunds"],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_refunds").select("*");
      const m = new Map<string, unknown[]>();
      for (const r of data ?? []) {
        const key = (r as { payment_id: string }).payment_id;
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(r);
      }
      return m;
    },
  });

  if (isLoading) return <TableSkeleton rows={8} />;

  return (
    <div>
      <PageHeader
        title="Payments & Refunds"
        subtitle="Transactions with refund state. Refund actions are gated by the Four-Gate Controller."
      />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Transaction</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Payment status</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Refund status</th>
              <th className="px-3 py-2">Refund ID</th>
              <th className="px-3 py-2">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).slice(0, 60).map((p) => {
              const pay = p as Payment & { resolveai_orders?: { order_id: string }; resolveai_customers?: { name: string; customer_code: string } };
              const refundRows = (refundMap?.get(pay.id) ?? []) as { refund_id: string; status: string }[];
              const refund = refundRows[0];
              return (
                <tr key={pay.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs font-medium">{pay.txn_id}</td>
                  <td className="px-3 py-2">
                    {pay.resolveai_customers?.name}
                    <div className="text-[11px] text-muted-foreground">{pay.resolveai_customers?.customer_code}</div>
                  </td>
                  <td className="px-3 py-2 font-medium">{pay.resolveai_orders?.order_id ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{inr(pay.amount)}</td>
                  <td className="px-3 py-2">
                    <Badge className={PAY_TONE[pay.status] ?? ""}>{pay.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{pay.method} · {pay.gateway}</td>
                  <td className="px-3 py-2">
                    {refund ? (
                      <Badge className={REFUND_TONE[refund.status] ?? ""}>{refund.status}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{refund?.refund_id ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(pay.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
