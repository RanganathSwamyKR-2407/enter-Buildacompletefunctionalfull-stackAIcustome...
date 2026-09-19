import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useEscalations } from "@/hooks/useData";
import { PageHeader, TableSkeleton } from "@/components/widgets";
import { EscalationPanel, ResolutionPassport } from "@/components/passport";
import { EscalationBadge, PriorityBadge } from "@/components/badges";
import { Card, CardContent } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";

export default function Escalations() {
  const { data: escalations, isLoading } = useEscalations();

  if (isLoading) return <TableSkeleton rows={5} />;

  return (
    <div>
      <PageHeader
        title="Escalations"
        subtitle="Cases handed to humans with a complete Resolution Passport — no restarting the investigation."
      />
      <div className="space-y-3">
        {(escalations ?? []).map((row) => {
          const esc = row as Record<string, unknown>;
          const escObj = {
            id: String(esc.id),
            case_id: String(esc.case_id),
            score: Number(esc.score),
            reasons: (esc.reasons as string[]) ?? [],
            recommended_queue: String(esc.recommended_queue),
            priority: String(esc.priority),
            passport: (esc.passport as Record<string, unknown>) ?? {},
            status: String(esc.status),
            created_at: String(esc.created_at),
          };
          const caseData = (esc.resolveai_cases ?? {}) as Record<string, unknown>;
          return (
            <Card key={escObj.id} className="border-danger/30">
              <CardContent className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Link to={`/investigations/${escObj.case_id}`} className="text-sm font-semibold text-brand hover:underline">
                    {String(caseData.case_id ?? "case")}
                  </Link>
                  <EscalationBadge score={escObj.score} />
                  <PriorityBadge priority={escObj.priority} />
                  <span className="text-xs text-muted-foreground">{escObj.recommended_queue} · {timeAgo(escObj.created_at)}</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <EscalationPanel
                    escalation={escObj}
                    caseRow={
                      caseData && caseData.status
                        ? ({ status: String(caseData.status), resolution_status: caseData.resolution_status ? String(caseData.resolution_status) : null } as never)
                        : null
                    }
                  />
                  {escObj.passport && Object.keys(escObj.passport).length > 0 && (
                    <ResolutionPassport passport={escObj.passport} />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(escalations ?? []).length === 0 && (
          <div className="rounded border border-dashed py-10 text-center text-sm text-muted-foreground">
            No escalations yet.
          </div>
        )}
      </div>
    </div>
  );
}
