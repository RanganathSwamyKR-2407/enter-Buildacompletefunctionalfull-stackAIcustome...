import { useState } from "react";
import { api, type SelfCheckResult } from "@/lib/api";
import { PageHeader } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, CheckCircle2, XCircle } from "lucide-react";
import { humanValue } from "@/lib/format";
import { SystemHealth, DemoMode } from "@/components/health-demo";

export default function SelfCheck() {
  const [result, setResult] = useState<SelfCheckResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await api.selfcheck();
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Demo Self-Check & System Health"
        subtitle="Runs the three end-to-end demo tracks against real seeded data and asserts their final state."
        actions={
          <Button onClick={() => void run()} disabled={running}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1.5 h-4 w-4" />}
            Run integration test
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <SystemHealth />
        <DemoMode />
      </div>

      {error && <div className="mb-4 rounded bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="space-y-3">
        {!result && !running && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Press "Run integration test" to execute scenarios A, B and C through the real lifecycle
              (fast mode), then verify the resulting database state.
            </CardContent>
          </Card>
        )}
        {running && (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Running the autonomous lifecycle for all three tracks…
            </CardContent>
          </Card>
        )}
        {result?.results.map((r) => (
          <Card key={r.scenario} className={r.pass ? "border-success/40" : "border-danger/40"}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {r.pass ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-danger" />
                  )}
                  {r.scenario}
                </div>
                <Badge className={r.pass ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}>
                  {r.pass ? "PASS" : "FAIL"}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Case <span className="font-medium text-foreground">{String(r.case_id)}</span> ·{" "}
                {Object.entries(r)
                  .filter(([k]) => !["scenario", "case_id", "pass"].includes(k))
                  .map(([k, v]) => `${k}=${humanValue(v)}`)
                  .join(" · ")}
              </div>
            </CardContent>
          </Card>
        ))}
        {result && (
          <div className="flex items-center gap-2 text-sm">
            <Badge className={result.allPass ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}>
              Overall: {result.allPass ? "ALL PASS" : "FAILURES PRESENT"}
            </Badge>
            <span className="text-muted-foreground">
              {result.allPass
                ? "Track A (autonomous refund), Track B (contradiction → escalation) and Track C (circuit breaker → escalation) all verified against the live database."
                : "Some assertions failed — inspect each track for details."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
