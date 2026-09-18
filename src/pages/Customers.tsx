import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers } from "@/hooks/useData";
import { Customer360 } from "@/components/customer-360";
import { CustomerJourney, EffortScore } from "@/components/customer-panels";
import { PageHeader, SkeletonRows } from "@/components/widgets";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { inr, pct } from "@/lib/format";
import type { Customer, Order, Payment, Refund, Ticket, CaseRow, Escalation } from "@/lib/types";

export default function Customers() {
  const { data: customers, isLoading } = useCustomers();
  const [q, setQ] = useState("");
  const filtered = (customers ?? []).filter((c) =>
    `${c.name} ${c.customer_code} ${c.city ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  ) as Customer[];

  return (
    <div>
      <PageHeader title="Customers" subtitle="360° view of profiles, history and risk signals." />
      <Input placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
      {isLoading ? (
        <SkeletonRows rows={8} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Lifetime value</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Refunds</th>
                <th className="px-3 py-2">Churn risk</th>
                <th className="px-3 py-2">City</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link to={`/customers/${c.id}`} className="font-medium text-brand hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">{c.customer_code}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={c.tier === "gold" ? "bg-warning-soft text-warning" : c.tier === "premium" ? "bg-brand-soft text-brand" : ""}>
                      {c.tier}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-medium">{inr(c.lifetime_value)}</td>
                  <td className="px-3 py-2">{c.orders_count}</td>
                  <td className="px-3 py-2">{c.refunds_count}</td>
                  <td className={`px-3 py-2 font-medium ${c.churn_risk >= 50 ? "text-danger" : ""}`}>{pct(c.churn_risk)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.city ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer-detail", id],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_customers").select("*").eq("id", id!).maybeSingle();
      return (data ?? null) as Customer | null;
    },
    enabled: Boolean(id),
  });

  const { data: orders } = useQuery({
    queryKey: ["customer-orders", id],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_orders").select("*").eq("customer_id", id!).order("created_at", { ascending: false });
      return (data ?? []) as Order[];
    },
    enabled: Boolean(id),
  });
  const { data: payments } = useQuery({
    queryKey: ["customer-payments", id],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_payments").select("*").eq("customer_id", id!).order("created_at", { ascending: false });
      return (data ?? []) as Payment[];
    },
    enabled: Boolean(id),
  });
  const { data: refunds } = useQuery({
    queryKey: ["customer-refunds", id],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_refunds").select("*").eq("customer_id", id!).order("created_at", { ascending: false });
      return (data ?? []) as Refund[];
    },
    enabled: Boolean(id),
  });
  const { data: tickets } = useQuery({
    queryKey: ["customer-tickets", id],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_tickets").select("*").eq("customer_id", id!).order("created_at", { ascending: false });
      return (data ?? []) as Ticket[];
    },
    enabled: Boolean(id),
  });
  const { data: cases } = useQuery({
    queryKey: ["customer-cases", id],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_cases").select("*").eq("customer_id", id!).order("created_at", { ascending: false });
      return (data ?? []) as CaseRow[];
    },
    enabled: Boolean(id),
  });

  const { data: escalations } = useQuery({
    queryKey: ["customer-escalations", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("resolveai_escalations")
        .select("*, resolveai_cases(customer_id)")
        .order("created_at", { ascending: false })
        .limit(100);
      return ((data ?? []) as unknown as (Escalation & { resolveai_cases: { customer_id: string } })[]).filter(
        (e) => e.resolveai_cases?.customer_id === id,
      );
    },
    enabled: Boolean(id),
  });

  if (isLoading || !customer) return <SkeletonRows rows={5} />;
  const escs = (escalations ?? []) as Escalation[];
  return (
    <div>
      <PageHeader
        title="Customer 360"
        subtitle={customer.customer_code}
        actions={<Link to="/customers" className="text-sm text-muted-foreground hover:underline">← All customers</Link>}
      />
      <Customer360
        customer={customer}
        orders={orders ?? []}
        payments={payments ?? []}
        refunds={refunds ?? []}
        tickets={tickets ?? []}
        cases={cases ?? []}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CustomerJourney
            orders={orders ?? []}
            payments={payments ?? []}
            refunds={refunds ?? []}
            tickets={tickets ?? []}
            cases={cases ?? []}
            escalations={escs}
          />
        </div>
        <EffortScore
          tickets={tickets ?? []}
          cases={cases ?? []}
          escalations={escs}
          refunds={refunds ?? []}
        />
      </div>
    </div>
  );
}
