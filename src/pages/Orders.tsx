import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrders } from "@/hooks/useData";
import { PageHeader, SkeletonRows, EmptyState } from "@/components/widgets";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate } from "@/lib/format";
import { MapPin, Package } from "lucide-react";
import type { Order } from "@/lib/types";

const STATUS_TONE: Record<string, string> = {
  delivered: "bg-success-soft text-success",
  shipped: "bg-info-soft text-info",
  processing: "bg-brand-soft text-brand",
  paid: "bg-muted text-muted-foreground",
  pending: "bg-warning-soft text-warning",
  cancelled: "bg-muted text-muted-foreground",
  returned: "bg-muted text-muted-foreground",
  failed: "bg-danger-soft text-danger",
};

export default function Orders() {
  const { data: orders, isLoading } = useOrders();

  const { data: customers } = useQuery({
    queryKey: ["orders-customers"],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_customers").select("id, name, customer_code");
      const m = new Map<string, { name: string; customer_code: string }>();
      for (const c of data ?? []) m.set((c as { id: string }).id, c as { name: string; customer_code: string });
      return m;
    },
  });

  if (isLoading) return <SkeletonRows rows={8} />;

  return (
    <div>
      <PageHeader title="Orders & Shipments" subtitle={`${(orders ?? []).length} orders across the customer base.`} />
      {(orders ?? []).length === 0 ? (
        <EmptyState title="No orders" />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Shipment</th>
                <th className="px-3 py-2">Courier</th>
                <th className="px-3 py-2">Tracking</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">GPS evidence</th>
                <th className="px-3 py-2">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).slice(0, 60).map((o) => {
                const order = o as Order;
                const cust = customers?.get(order.customer_id);
                const gps = order.gps_evidence;
                return (
                  <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{order.order_id}</td>
                    <td className="px-3 py-2">
                      {cust?.name}
                      <div className="text-[11px] text-muted-foreground">{cust?.customer_code}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={STATUS_TONE[order.status] ?? ""}>{order.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{order.shipment_status ?? "—"}</td>
                    <td className="px-3 py-2">{order.courier ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{order.tracking_number ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{inr(order.amount)}</td>
                    <td className="px-3 py-2">
                      {gps?.matched === false ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-danger">
                          <MapPin className="h-3 w-3" /> Mismatch {gps.distance_km != null ? `(${gps.distance_km} km)` : ""}
                        </span>
                      ) : gps?.matched === true ? (
                        <span className="text-xs text-success">Matched</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(order.delivered_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Package className="h-3.5 w-3.5" /> Orders marked delivered carry courier + GPS proof-of-delivery used by the contradiction detector.
      </div>
    </div>
  );
}
