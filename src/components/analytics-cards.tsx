import { Inbox, CheckCircle2, Timer, ShieldCheck, AlertTriangle, Zap, XOctagon, Gauge } from "lucide-react";
import type { AnalyticsSnapshot } from "@/lib/types";
import { StatCard } from "@/components/widgets";

export function AnalyticsCards({ a }: { a: AnalyticsSnapshot }) {
  const o = a.operational;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Open complaints" value={o.open_complaints} sub={`of ${o.total_cases} total`} tone="info" icon={<Inbox className="h-4 w-4" />} />
      <StatCard label="Resolved" value={o.resolved_complaints} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
      <StatCard label="Avg resolution" value={`${o.avg_resolution_minutes}m`} icon={<Timer className="h-4 w-4" />} />
      <StatCard label="SLA compliance" value={`${o.sla_compliance_pct}%`} tone={o.sla_compliance_pct < 80 ? "warning" : "success"} icon={<ShieldCheck className="h-4 w-4" />} />
      <StatCard label="Escalation rate" value={`${o.escalation_rate_pct}%`} sub={`${o.escalated_count} escalated`} tone={o.escalation_rate_pct > 25 ? "danger" : "default"} icon={<AlertTriangle className="h-4 w-4" />} />
      <StatCard label="Automation success" value={`${o.automation_success_rate_pct}%`} tone={o.automation_success_rate_pct < 70 ? "warning" : "success"} icon={<Zap className="h-4 w-4" />} />
      <StatCard label="Verification failures" value={`${o.verification_failure_rate_pct}%`} tone={o.verification_failure_rate_pct > 0 ? "danger" : "default"} icon={<XOctagon className="h-4 w-4" />} />
      <StatCard label="Avg customer effort" value={`${o.avg_customer_effort} contacts`} icon={<Gauge className="h-4 w-4" />} />
    </div>
  );
}
