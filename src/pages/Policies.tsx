import { usePolicies, useAgents } from "@/hooks/useData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, SkeletonRows } from "@/components/widgets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Scale, Bot, Lightbulb, CheckCircle2, XCircle } from "lucide-react";
import { inr, timeAgo, humanLabel } from "@/lib/format";
import type { Policy, KnowledgeCandidate } from "@/lib/types";

export default function Policies() {
  const { data: policies, isLoading } = usePolicies();
  const { data: agents } = useAgents();
  const qc = useQueryClient();
  const [showTech, setShowTech] = useState(false);

  const { data: candidates } = useQuery({
    queryKey: ["knowledge-candidates"],
    queryFn: () => api.knowledgeCandidates("list"),
  });
  const cands = (candidates?.candidates ?? []) as KnowledgeCandidate[];

  const review = async (id: string, decision: "approved" | "rejected") => {
    await api.knowledgeCandidates("review", { id, decision });
    await qc.invalidateQueries({ queryKey: ["knowledge-candidates"] });
  };

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
                    {(policy.allowed_actions ?? []).map((a) => (
                      <span key={a} className="rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand">{humanLabel(a)}</span>
                    ))}
                  </div>
                </div>
                {Object.keys(policy.authority_limits).length > 0 && (
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Authority limits</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(policy.authority_limits ?? {}).map(([k, v]) => (
                        <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {k} ≤ {inr(Number(v))}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Conditions</div>
                  <ul className="mt-1 space-y-1">
                    {Object.entries(policy.conditions ?? {}).map(([k, v]) => (
                      <li key={k} className="flex items-center gap-1.5 text-[13px]">
                        <span className={v === true ? "text-success" : v === false ? "text-danger" : "text-muted-foreground"}>
                          {v === true ? "✓" : v === false ? "✕" : "•"}
                        </span>
                        {humanLabel(k)}
                        {typeof v === "number" && <span className="text-muted-foreground">(threshold: {v})</span>}
                      </li>
                    ))}
                    {Object.keys(policy.conditions ?? {}).length === 0 && <li className="text-xs text-muted-foreground">No conditions defined</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Restrictions</div>
                  {(policy.restrictions ?? []).length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {(policy.restrictions ?? []).map((r) => (
                        <li key={r} className="text-[13px]">• {humanLabel(r)}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-muted-foreground">No restrictions defined</div>
                  )}
                </div>
                <button
                  onClick={() => setShowTech(!showTech)}
                  className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  {showTech ? "Hide Technical Details" : "View Technical Details"}
                </button>
                {showTech && (
                  <pre className="whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px]">
                    {JSON.stringify(policy, null, 1)}
                  </pre>
                )}
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

      <div className="mt-6">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="h-4 w-4 text-warning" /> Knowledge Candidates
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          Human-approved resolutions awaiting review before entering the trusted knowledge base. Only Managers/Admins may approve.
        </p>
        <div className="space-y-1.5">
          {cands.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-[13px] font-medium">{c.problem}</div>
                  <Badge className={c.status === "approved" ? "bg-success-soft text-success" : c.status === "rejected" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}>
                    {c.status}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  root cause: {c.root_cause ?? "—"} · confidence {Math.round(c.confidence * 100)}% · case {c.case_id} · {timeAgo(c.created_at)}
                  {c.reviewed_by ? ` · reviewed by ${c.reviewed_by}` : ""}
                </div>
                <div className="mt-1 rounded bg-muted/30 px-2 py-1 text-xs">{c.resolution}</div>
                {c.status === "pending" && (
                  <div className="mt-1.5 flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 bg-success text-success-foreground" onClick={() => void review(c.id, "approved")}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve to Knowledge Base
                    </Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => void review(c.id, "rejected")}>
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {cands.length === 0 && <div className="text-xs text-muted-foreground">No knowledge candidates yet. Generate them from resolved escalated cases.</div>}
        </div>
      </div>
    </div>
  );
}
