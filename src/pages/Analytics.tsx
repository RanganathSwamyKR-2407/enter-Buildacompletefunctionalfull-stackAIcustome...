import { useAnalytics } from "@/hooks/useData";
import { AnalyticsCards } from "@/components/analytics-cards";
import { PageHeader, SkeletonRows } from "@/components/widgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { AnalyticsSnapshot } from "@/lib/types";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444"];

export default function Analytics() {
  const { data, isLoading } = useAnalytics();

  if (isLoading) return <SkeletonRows rows={6} />;
  const a = (data?.analytics ?? {}) as AnalyticsSnapshot;

  const topIntents = (a.complaints?.top_intents ?? []).map((x) => ({ name: x.intent, count: x.cnt }));
  const rootCauses = (a.complaints?.top_root_causes ?? []).map((x) => ({
    name: String(x.root_cause).slice(0, 34) + (String(x.root_cause).length > 34 ? "…" : ""),
    count: x.cnt,
  }));

  return (
    <div>
      <PageHeader
        title="Operational Analytics"
        subtitle="All values computed from live database state — no static numbers."
      />
      <AnalyticsCards a={a} />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Top complaint categories</CardTitle>
          </CardHeader>
          <CardContent className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topIntents}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {topIntents.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Top root causes</CardTitle>
          </CardHeader>
          <CardContent className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rootCauses} layout="vertical">
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Recurring fingerprints</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-1.5">
              {(a.complaints?.recurring_fingerprints ?? []).map((f) => (
                <div key={f.fingerprint_id} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-[13px]">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-xs text-muted-foreground">×{f.frequency} · {f.severity}</span>
                </div>
              ))}
              {(a.complaints?.recurring_fingerprints ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground">No fingerprints.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Customer risk signals</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-1.5 text-[13px]">
              <RiskRow label="Repeat-contact customers" value={a.customers?.repeat_contact_customers ?? 0} />
              <RiskRow label="Negative-sentiment customers" value={a.customers?.negative_sentiment_customers ?? 0} />
              <RiskRow label="High churn risk (≥50)" value={a.customers?.high_churn_risk_customers ?? 0} />
              <RiskRow label="Avg churn risk" value={`${a.customers?.avg_churn_risk ?? 0}%`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">High-value customers with open cases</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-1.5">
              {(a.customers?.high_value_unresolved ?? []).map((c) => (
                <div key={c.customer_code} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-[13px]">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">₹{c.lifetime_value.toLocaleString("en-IN")} · {c.open_cases} open</span>
                </div>
              ))}
              {(a.customers?.high_value_unresolved ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground">None.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RiskRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded border px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
