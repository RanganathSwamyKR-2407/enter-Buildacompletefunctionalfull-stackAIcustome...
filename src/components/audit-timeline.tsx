import { ScrollText } from "lucide-react";
import type { AuditLog } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/format";
import { classNames } from "@/lib/format";

export function AuditTimeline({ logs, limit = 40 }: { logs?: AuditLog[]; limit?: number }) {
  const items = (logs ?? []).slice(0, limit);
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 py-3">
        <ScrollText className="h-4 w-4 text-brand" />
        <CardTitle className="text-sm font-semibold">Audit Trail</CardTitle>
        <span className="ml-auto text-[11px] text-muted-foreground">{items.length} events</span>
      </CardHeader>
      <CardContent className="p-4">
        <div className="relative">
          {items.map((log, idx) => (
            <div key={log.id} className="relative flex gap-3 pb-3">
              {idx < items.length - 1 && <span className="absolute left-[4px] top-4 h-full w-px bg-border" />}
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="text-[13px] font-medium">
                    {log.agent ?? "system"} <span className="text-muted-foreground">· {log.action}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{fmtDate(log.created_at)}</span>
                </div>
                <div className={classNames("mt-0.5 text-[11px] text-muted-foreground")}>
                  actor: {log.actor}
                  {Object.keys(log.decision ?? {}).length > 0 && (
                    <span className="ml-2">decision: {JSON.stringify(log.decision).slice(0, 120)}</span>
                  )}
                </div>
                {log.verification && Object.keys(log.verification).length > 0 && (
                  <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                    {JSON.stringify(log.verification).slice(0, 160)}
                  </div>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-xs text-muted-foreground">No audit events recorded.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
