import { usePolicies, useAgents } from "@/hooks/useData";
import { PageHeader, SkeletonRows } from "@/components/widgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Scale, Bot } from "lucide-react";
import { inr } from "@/lib/format";
import type { Policy } from "@/lib/types";

export default function Policies() {
  const { data: policies, isLoading } = usePolicies();
  const { data: agents } = useAgents();

  if (isLoading) return <SkeletonRows rows={5} />;

  return (
    <div>
      <PageHeader
        title="Policy Engine"
        subtitle="Deterministic rules the action engine must consult before executing anything. The LLM never invents policy."
      />
      <div className="mb-4 flex items-center gap-2 rounded-md border bg-brand-soft/40 px-3 py-2 text-xs text-muted-foreground">
        <Scale className="h-3.5 w-3.5 text-brand" />
        Every policy decision shown in the Glass Box Console comes from these rows.
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {(policies ?? []).map((p) => {
          const policy = p as Policy;
          return (
            <Card key={policy.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4 text-brand" />
                  {policy.name}
                </CardTitle>
                <Badge className="bg-muted text-muted-foreground">{policy.policy_id}</Badge>
              </CardHeader>
              <CardContent className="space-y-2 p-4 text-[13px]">
                <div className="text-muted-foreground">{policy.description}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Category</div>
                    <div>{policy.category}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Effective</div>
                    <div>{policy.effective_from}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Allowed actions</div>
                  <div className="flex flex-wrap gap-1.5">
                    {policy.allowed_actions.map((a) => (
                      <span key={a} className="rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">{a}</span>
                    ))}
                  </div>
                </div>
                {Object.keys(policy.authority_limits).length > 0 && (
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Authority limits</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(policy.authority_limits).map(([k, v]) => (
                        <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {k} ≤ {inr(Number(v))}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Conditions</div>
                  <pre className="whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px]">
                    {JSON.stringify(policy.conditions, null, 1)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-brand" /> Specialist Agents
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(agents ?? []).map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="font-semibold">{a.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{a.description}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(a.specialties as string[]).map((s) => (
                    <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{s}</span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
