import { Radar, AlertTriangle, Activity, Fingerprint } from "lucide-react";
import type { Incident, Fingerprint as FingerprintRow } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { timeAgo, classNames } from "@/lib/format";

const SEV_TONE: Record<string, string> = {
  critical: "bg-danger-soft text-danger",
  high: "bg-warning-soft text-warning",
  medium: "bg-info-soft text-info",
  low: "bg-muted text-muted-foreground",
};

export function IncidentPanel({
  incidents,
  fingerprints,
}: {
  incidents: Incident[];
  fingerprints: FingerprintRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {incidents.map((inc) => (
          <Card key={inc.id} className="border-danger/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-danger" />
                  <span className="font-semibold">{inc.incident_id}</span>
                </div>
                <Badge className={SEV_TONE[inc.severity] ?? ""}>{inc.severity.toUpperCase()}</Badge>
              </div>
              <div className="mt-1.5 text-sm font-medium">{inc.name}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-muted/40 px-2 py-1.5">
                  <div className="text-muted-foreground">Affected cases</div>
                  <div className="text-base font-semibold">{inc.affected_case_count}</div>
                </div>
                <div className="rounded bg-muted/40 px-2 py-1.5">
                  <div className="text-muted-foreground">First detected</div>
                  <div className="text-sm font-medium">{timeAgo(inc.first_detected_at)}</div>
                </div>
              </div>
              <div className={classNames("mt-2 flex items-center gap-1.5 text-xs text-muted-foreground")}>
                <Activity className="h-3 w-3" /> {inc.status}
              </div>
              {inc.recommended_response && (
                <div className="mt-2 rounded border border-warning/30 bg-warning-soft/40 px-2.5 py-1.5 text-xs">
                  <span className="font-medium">Recommended response:</span> {inc.recommended_response}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {incidents.length === 0 && (
          <Card>
            <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> No active incidents.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="rounded-md border">
        <div className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">
          Failure Fingerprints
        </div>
        {fingerprints.map((fp) => (
          <div key={fp.id} className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-[13px] last:border-0">
            <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{fp.fingerprint_id}</span>
            <span>{fp.name}</span>
            <span className="text-xs text-muted-foreground">
              {fp.affected_system} · frequency {fp.frequency}
            </span>
            <Badge className={classNames("ml-auto", SEV_TONE[fp.severity] ?? "")}>{fp.severity}</Badge>
          </div>
        ))}
        {fingerprints.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">No fingerprints recorded.</div>
        )}
      </div>
    </div>
  );
}
