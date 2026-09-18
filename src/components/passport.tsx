import { LifeBuoy, FileText, ScrollText } from "lucide-react";
import type { Escalation, CaseRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EscalationBadge, PriorityBadge } from "@/components/badges";
import { fmtDate, timeAgo, humanLabel, humanValue } from "@/lib/format";
import { asArray } from "@/lib/verification";

export function EscalationPanel({ escalation, caseRow }: { escalation: Escalation; caseRow?: CaseRow | null }) {
  return (
    <Card className="border-danger/40 bg-danger-soft/20">
      <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <LifeBuoy className="h-4 w-4 text-danger" />
          Human Escalation
        </CardTitle>
        <EscalationBadge score={escalation.score} />
      </CardHeader>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap gap-2">
          {asArray(escalation.reasons).map((r, i) => (
            <span key={i} className="rounded bg-card px-2 py-1 text-xs text-muted-foreground">
              {r}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Queue: <span className="font-medium text-foreground">{escalation.recommended_queue}</span>
          </span>
          <PriorityBadge priority={escalation.priority} />
          <span>{timeAgo(escalation.created_at)}</span>
        </div>
        {caseRow?.resolution_status && (
          <div className="rounded bg-card px-2.5 py-1.5 text-xs font-medium">{caseRow.resolution_status}</div>
        )}
      </CardContent>
    </Card>
  );
}

function PassportRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b py-1.5 text-[13px] last:border-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export function ResolutionPassport({ passport }: { passport: Record<string, unknown> }) {
  const p = passport as Record<string, unknown>;
  const customer = (p.customer_profile ?? p.customer ?? {}) as Record<string, unknown>;
  const understanding = (p.understanding ?? {}) as Record<string, unknown>;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 py-3">
        <ScrollText className="h-4 w-4 text-brand" />
        <CardTitle className="text-sm font-semibold">Resolution Passport</CardTitle>
        <span className="ml-auto text-[11px] text-muted-foreground">Case {String(p.case_id ?? "")}</span>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 pb-1 text-xs font-medium text-muted-foreground">
          <FileText className="h-3 w-3" />
          Generated {p.generated_at ? fmtDate(String(p.generated_at)) : "—"}
        </div>
        <PassportRow label="Customer">
          {String(customer.name ?? "")} · {String(customer.tier ?? "")} · {String(customer.customer_code ?? "")}
        </PassportRow>
        <PassportRow label="Original complaint">{String(p.original_complaint ?? "—")}</PassportRow>
        <PassportRow label="Intent">
          {String(understanding.intent ?? "—")} · urgency {String(understanding.urgency ?? "—")} · sentiment{" "}
          {String(understanding.sentiment ?? "—")}
        </PassportRow>
        <PassportRow label="Root cause">
          {String(p.root_cause ?? "—")}
          {p.root_cause_confidence != null && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({Math.round(Number(p.root_cause_confidence) * 100)}%)
            </span>
          )}
        </PassportRow>
        <PassportRow label="Contradictions">
          {(p.contradictions as unknown[])?.length ? (
            <ul className="list-inside list-disc">
              {(p.contradictions as { label: string }[]).map((c, i) => (
                <li key={i} className="text-danger">
                  {c.label}
                </li>
              ))}
            </ul>
          ) : (
            "None detected"
          )}
        </PassportRow>
        <PassportRow label="Four-Gate">
          {Object.entries((p.four_gates ?? {}) as Record<string, { status?: string }>).map(([k, g]) => (
            <span key={k} className="mr-2 inline-block text-xs">
              {k}: <b>{g.status ?? "—"}</b>
            </span>
          ))}
        </PassportRow>
        <PassportRow label="Actions attempted">
          {(p.actions_attempted as unknown[])?.length
            ? (p.actions_attempted as Record<string, unknown>[]).map((a, i) => (
                <div key={i} className="text-xs">
                  {String(a.status ?? a.detail ?? "—")}
                </div>
              ))
            : (p.action_history as unknown[])?.length
              ? (p.action_history as Record<string, unknown>[]).map((a, i) => (
                  <div key={i} className="text-xs">
                    attempt {String(a.attempt ?? i + 1)}: {String(a.status ?? "—")}
                    {a.error ? ` · ${String(a.error)}` : ""}
                  </div>
                ))
              : "None"}
        </PassportRow>
        <PassportRow label="Recommended next action">
          <div className="space-y-0.5">
            {Object.entries((p.recommended_next_action ?? {}) as Record<string, unknown>).map(([k, v]) => (
              <div key={k} className="text-[13px]">
                <span className="text-muted-foreground">{humanLabel(k)}:</span> {humanValue(v)}
              </div>
            ))}
            {Object.keys((p.recommended_next_action ?? {}) as Record<string, unknown>).length === 0 && (
              <span className="text-[13px] text-muted-foreground">Not available</span>
            )}
          </div>
        </PassportRow>
        <PassportRow label="Escalation reason">
          {(p.escalation_reason as string[])?.join("; ") ?? "—"}
        </PassportRow>
      </CardContent>
    </Card>
  );
}
