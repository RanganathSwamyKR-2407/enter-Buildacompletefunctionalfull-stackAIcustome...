import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIncidents } from "@/hooks/useData";
import { useCases } from "@/hooks/useData";
import { PageHeader, TableSkeleton, LoadingState } from "@/components/widgets";
import { IncidentPanel } from "@/components/incident-panel";
import { TrendsPanel, ImpactPanel } from "@/components/knowledge-panels";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/badges";
import type { Incident, Customer, Escalation } from "@/lib/types";

export default function Incidents() {
  const { data, isLoading } = useIncidents();
  const { data: cases } = useCases();

  const { data: customers } = useQuery({
    queryKey: ["incidents-customers"],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_customers").select("*").limit(100);
      const m = new Map<string, Customer>();
      for (const c of data ?? []) m.set((c as { id: string }).id, c as Customer);
      return m;
    },
  });

  const { data: escalations } = useQuery({
    queryKey: ["incidents-escalations"],
    queryFn: async () => {
      const { data } = await supabase.from("resolveai_escalations").select("case_id, score, status").limit(200);
      return (data ?? []) as Escalation[];
    },
  });

  if (isLoading) return <TableSkeleton rows={5} />;

  const incidentCases = (incidentUuid: string | undefined) => {
    if (!incidentUuid) return [];
    const linked = data?.incidents.find((i) => i.id === incidentUuid)?.linked_case_uuids ?? [];
    return (cases ?? []).filter((c) => linked.includes(c.id));
  };

  const relatedEscalations = (caseUuids: string[]) =>
    (escalations ?? []).filter((e) => caseUuids.includes(e.case_id));

  return (
    <div>
      <PageHeader
        title="Incident Detection"
        subtitle="Recurring failure fingerprints that cross the incident threshold are surfaced here automatically."
      />
      <IncidentPanel incidents={(data?.incidents ?? []) as Incident[]} fingerprints={data?.fingerprints ?? []} />

      <div className="mt-5">
        <TrendsPanel fingerprints={data?.fingerprints ?? []} cases={cases ?? []} />
      </div>

      <div className="mt-6 space-y-3">
        <div className="text-sm font-semibold">Proactive customer impact & affected complaints</div>
        {((data?.incidents ?? []).length) === 0 ? (
          <LoadingState label="No incidents" />
        ) : (
          (data?.incidents ?? []).map((inc) => (
            <div key={inc.id} className="rounded-md border p-3">
              <div className="mb-2 text-[13px] font-medium text-muted-foreground">
                {inc.incident_id} · {inc.name}
              </div>
              <ImpactPanel incident={inc} cases={cases ?? []} customers={customers ?? new Map()} />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Root cause / fingerprint: <b className="text-foreground">{inc.fingerprint_id ?? "—"}</b></span>
                <span>Related escalations: <b className="text-foreground">{relatedEscalations(inc.linked_case_uuids ?? []).length}</b></span>
                {relatedEscalations(inc.linked_case_uuids ?? []).slice(0, 3).map((e) => (
                  <span key={e.id} className="rounded bg-danger-soft/50 px-1.5 py-0.5">
                    esc {e.score}/100 · {e.status}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {incidentCases(inc.id).slice(0, 8).map((c) => (
                  <Link key={c.id} to={`/investigations/${c.id}`} className="flex items-center justify-between rounded border px-2.5 py-1.5 text-[13px] hover:border-brand">
                    <span className="font-medium text-brand">{c.case_id}</span>
                    <span className="truncate text-muted-foreground">{c.message_text}</span>
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
                {incidentCases(inc.id).length === 0 && (
                  <div className="text-xs text-muted-foreground">No cases linked yet.</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
