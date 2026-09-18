import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, HeartPulse, FlaskConical, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { classNames } from "@/lib/format";

// ---------------------------------------------------------------------
// 17. System Health
// ---------------------------------------------------------------------
export function SystemHealth() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
  });

  const tone = (s: string) =>
    s === "HEALTHY" ? "bg-success-soft text-success" : s === "DEGRADED" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <HeartPulse className="h-4 w-4 text-brand" /> System Health
            {data && (
              <Badge className={tone(data.status)}>{data.status}</Badge>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-7" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Re-check
          </Button>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Running live checks…
          </div>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(data?.checks ?? []).map((c) => (
              <div key={c.component} className="flex items-start gap-2 rounded border px-2.5 py-1.5 text-[13px]">
                {c.status === "HEALTHY" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                ) : c.status === "DEGRADED" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{c.component}</div>
                  <div className="text-[11px] text-muted-foreground">{c.detail}</div>
                </div>
                <Badge className={classNames("ml-auto shrink-0", tone(c.status))}>{c.status}</Badge>
              </div>
            ))}
            {(data?.checks ?? []).length === 0 && (
              <div className="text-sm text-muted-foreground">No checks returned.</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
// 18. Demo Mode — launches the three real scenarios through the engine
// ---------------------------------------------------------------------
const DEMO_SCENARIOS = [
  {
    key: "A",
    title: "Scenario 1 — Duplicate payment",
    customerCode: "CUST-1001",
    message: "I was charged twice for my order. The order is still pending and I already contacted support twice.",
    expect: "Autonomous investigation → Four Gates → refund → verification → RESOLVED",
  },
  {
    key: "B",
    title: "Scenario 2 — Delivery contradiction",
    customerCode: "CUST-1002",
    message: "The courier says delivered but I never received my package.",
    expect: "Conflicting evidence → autonomous action blocked → escalation → Resolution Passport",
  },
  {
    key: "C",
    title: "Scenario 3 — Repeated refund failure",
    customerCode: "CUST-1003",
    message: "My refund is not coming through. I was charged and the refund keeps failing.",
    expect: "Retries → circuit breaker → automation paused → escalation",
  },
];

export function DemoMode() {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { case_id: string; case_uuid: string; status: string; resolution_status: string | null }>>({});

  const launch = async (s: (typeof DEMO_SCENARIOS)[number]) => {
    setRunning(s.key);
    try {
      const { data: cust } = await supabase.from("resolveai_customers").select("id").eq("customer_code", s.customerCode).maybeSingle();
      const res = await api.chat(s.message, String((cust as { id: string }).id), true);
      setResults((prev) => ({ ...prev, [s.key]: { case_id: res.case_id, case_uuid: res.case_uuid, status: res.status, resolution_status: res.resolution_status } }));
    } catch (e) {
      setResults((prev) => ({ ...prev, [s.key]: { case_id: "error", case_uuid: "", status: "error", resolution_status: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <FlaskConical className="h-4 w-4 text-brand" /> Demo Mode
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Launches each scenario through the real engine and database (deterministic mode). Open the produced case in the Glass Box Console.
        </p>
        <div className="space-y-2">
          {DEMO_SCENARIOS.map((s) => {
            const res = results[s.key];
            return (
              <div key={s.key} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground">{s.expect}</div>
                  {res && (
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      {res.status === "resolved" ? (
                        <Badge className="bg-success-soft text-success">RESOLVED</Badge>
                      ) : res.status === "escalated" ? (
                        <Badge className="bg-danger-soft text-danger">ESCALATED</Badge>
                      ) : (
                        <Badge className="bg-warning-soft text-warning">{res.status}</Badge>
                      )}
                      <span className="text-muted-foreground">{res.resolution_status}</span>
                      {res.case_uuid && (
                        <Link to={`/investigations/${res.case_uuid}`} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                          Open console <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                <Button size="sm" className="h-8" onClick={() => void launch(s)} disabled={running !== null}>
                  {running === s.key && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Launch
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
