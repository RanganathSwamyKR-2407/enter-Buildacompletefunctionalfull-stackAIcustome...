import { useIncidents } from "@/hooks/useData";
import { useCases } from "@/hooks/useData";
import { PageHeader, SkeletonRows, LoadingState } from "@/components/widgets";
import { IncidentPanel } from "@/components/incident-panel";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/badges";
import type { Incident } from "@/lib/types";

export default function Incidents() {
  const { data, isLoading } = useIncidents();
  const { data: cases } = useCases();

  if (isLoading) return <SkeletonRows rows={5} />;

  const incidentCases = (incidentUuid: string | undefined) => {
    if (!incidentUuid) return [];
    const linked = data?.incidents.find((i) => i.id === incidentUuid)?.linked_case_uuids ?? [];
    return (cases ?? []).filter((c) => linked.includes(c.id));
  };

  return (
    <div>
      <PageHeader
        title="Incident Detection"
        subtitle="Recurring failure fingerprints that cross the incident threshold are surfaced here automatically."
      />
      <IncidentPanel incidents={(data?.incidents ?? []) as Incident[]} fingerprints={data?.fingerprints ?? []} />

      <div className="mt-6 space-y-3">
        <div className="text-sm font-semibold">Affected complaints (linked cases)</div>
        {!data || data.incidents.length === 0 ? (
          <LoadingState label="No incidents" />
        ) : (
          data.incidents.map((inc) => (
            <div key={inc.id} className="rounded-md border p-3">
              <div className="mb-2 text-[13px] font-medium text-muted-foreground">
                {inc.incident_id} · {inc.name}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
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
