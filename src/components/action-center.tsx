import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/panels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, ThumbsUp, ThumbsDown, PenLine, Gauge, ShieldAlert } from "lucide-react";
import { inr, fmtDate, classNames } from "@/lib/format";
import {
  evaluateAllGates,
  AUTHORITY_LIMITS,
} from "@/lib/engine";
import type { GateResult, CaseRow, AgentAction, ActionVerification } from "@/lib/types";
import { asArray } from "@/lib/verification";

// ---------------------------------------------------------------------
// 2. Human approval / override panel
// ---------------------------------------------------------------------
export function ApprovalPanel({ caseRow, customerTier }: { caseRow: CaseRow; customerTier: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [modifiedAmount, setModifiedAmount] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; detail: string } | null>(null);

  const rec = (caseRow.recommended_action ?? {}) as Record<string, unknown>;
  const action = String(rec.action ?? "issue_refund");
  const amount = modifiedAmount ?? (typeof rec.amount === "number" ? rec.amount : 0);
  const paymentTxn = asArray(caseRow.transaction_ids)[0];

  const propose = () =>
    api.action({
      action,
      case_id: caseRow.id,
      payment_txn: paymentTxn,
      amount,
    });

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    setOutcome(null);
    try {
      const res = await api.action({
        action,
        case_id: caseRow.id,
        payment_txn: paymentTxn,
        amount,
        human_decision: decision,
      });
      setOutcome({ ok: res.ok, detail: res.detail ?? (decision === "approve" ? "Action executed & verified" : "Action rejected") });
      await qc.invalidateQueries();
    } catch (e) {
      setOutcome({ ok: false, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const [proposal, setProposal] = useState<Awaited<ReturnType<typeof propose>> | null>(null);
  const [checking, setChecking] = useState(false);

  const checkApproval = async () => {
    setChecking(true);
    setOutcome(null);
    try {
      const res = await propose();
      setProposal(res);
      if (!res.requires_human_approval) {
        setOutcome({ ok: res.ok, detail: res.detail ?? "Gates passed — action executed directly." });
        await qc.invalidateQueries();
      }
    } catch (e) {
      setOutcome({ ok: false, detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setChecking(false);
    }
  };

  const gates = (proposal?.gates ?? {}) as Record<string, GateResult>;

  return (
    <SectionCard title="Human Approval / Override" icon={<ShieldAlert className="h-4 w-4 text-warning" />}>
      <div className="space-y-2 text-[13px]">
        <div className="rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          <b>AI Recommendation:</b> {action} {action === "issue_refund" ? `of ${inr(amount)}` : ""} on {caseRow.case_id}
          {caseRow.contradiction_detected ? " — blocked (contradiction)." : "."}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border px-2 py-1"><b>Evidence:</b> {caseRow.evidence_count} items</div>
          <div className="rounded border px-2 py-1"><b>Policy:</b> {String((caseRow.policy_result as Record<string, unknown>)?.policy_id ?? "—")}</div>
          <div className="rounded border px-2 py-1"><b>Authority:</b> {String((caseRow.authority_result as GateResult)?.status ?? "—")}</div>
          <div className="rounded border px-2 py-1"><b>Risk:</b> {String((caseRow.risk_result as GateResult)?.status ?? "—")}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Proposed action:</span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{action}</code>
          {action === "issue_refund" && (
            <Input
              type="number"
              value={amount || ""}
              onChange={(e) => setModifiedAmount(Number(e.target.value))}
              className="h-8 w-28 text-xs"
              placeholder="Amount ₹"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void checkApproval()} disabled={checking || busy !== null}>
            {checking ? "Checking…" : "Check gates"}
          </Button>
          {proposal?.requires_human_approval && (
            <>
              <Button size="sm" variant="default" className="bg-success text-success-foreground" onClick={() => void decide("approve")} disabled={busy !== null}>
                <ThumbsUp className="mr-1 h-3.5 w-3.5" /> Approve & Execute
              </Button>
              <Button size="sm" variant="outline" onClick={() => void decide("reject")} disabled={busy !== null}>
                <ThumbsDown className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
              <span className="text-[11px] text-muted-foreground">Modify the amount above, then Approve.</span>
            </>
          )}
        </div>
        {proposal?.requires_human_approval && (
          <div className="rounded border border-warning/40 bg-warning-soft/40 px-2 py-1.5 text-xs">
            <div className="font-semibold text-warning">Approval required</div>
            {Object.entries(gates).map(([k, g]) => (
              <div key={k}>
                {k}: <b>{g.status}</b> — {g.detail}
              </div>
            ))}
            <div className="mt-1">{proposal.detail}</div>
          </div>
        )}
        {outcome && (
          <div className={classNames("rounded px-2 py-1.5 text-xs font-medium", outcome.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
            {outcome.ok ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : <XCircle className="mr-1 inline h-3.5 w-3.5" />}
            {outcome.detail}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 8. Action Verification Center
// ---------------------------------------------------------------------
export function VerificationCenter({ caseRow }: { caseRow: CaseRow }) {
  const [rows, setRows] = useState<{ actions: AgentAction[]; verifications: Map<string, ActionVerification> } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [{ data: actions }, { data: verifs }] = await Promise.all([
      supabase.from("resolveai_agent_actions").select("*").eq("case_id", caseRow.id).order("created_at", { ascending: true }),
      supabase.from("resolveai_action_verifications").select("*").eq("case_id", caseRow.id),
    ]);
    const vm = new Map<string, ActionVerification>();
    for (const v of verifs ?? []) vm.set(String((v as { action_id: string }).action_id), v as ActionVerification);
    setRows({ actions: (actions ?? []) as AgentAction[], verifications: vm });
    setLoaded(true);
  };

  return (
    <SectionCard title="Action Verification Center" icon={<CheckCircle2 className="h-4 w-4 text-info" />}>
      {!loaded ? (
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Load verification records
        </Button>
      ) : rows && rows.actions.length === 0 ? (
        <div className="text-xs text-muted-foreground">No actions recorded for this case.</div>
      ) : (
        <div className="space-y-2">
          {rows?.actions.map((a) => {
            const v = rows.verifications.get(a.id);
            return (
              <div key={a.id} className="rounded border px-2.5 py-1.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{a.action}</code>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">ACT-{a.id.slice(0, 8).toUpperCase()}</code>
                  {typeof a.input?.amount === "number" && <span className="font-medium">{inr(a.input.amount)}</span>}
                  <Badge className={a.status === "succeeded" ? "bg-success-soft text-success" : a.status === "failed" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}>
                    Execution: {a.status.toUpperCase()}
                  </Badge>
                  {v && (
                    <Badge className={v.overall === "passed" ? "bg-success-soft text-success" : v.overall === "failed" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}>
                      Verification: {v.overall.toUpperCase()}
                    </Badge>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">{fmtDate(a.created_at)}</span>
                </div>
                {v && asArray(v.checks).length > 0 && (
                  <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                    {asArray(v.checks).map((c, i) => (
                      <div key={i} className="flex items-center gap-1">
                        {c.pass ? <CheckCircle2 className="h-3 w-3 text-success" /> : <XCircle className="h-3 w-3 text-danger" />}
                        <span>{c.name}: {String(c.actual ?? "—")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {rows && [...rows.verifications.values()].length > rows.actions.length && (
            <div className="text-[11px] text-muted-foreground">Some verifications have no matching action row.</div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------
// 9. Circuit Breaker Monitor
// ---------------------------------------------------------------------
export function BreakerMonitor({ caseRow }: { caseRow: CaseRow }) {
  const [stats, setStats] = useState<{ total: number; ok: number; failed: number; verifFail: number; retries: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [{ data: actions }, { data: verifs }] = await Promise.all([
      supabase.from("resolveai_agent_actions").select("status, action").eq("case_id", caseRow.id),
      supabase.from("resolveai_action_verifications").select("overall").eq("case_id", caseRow.id),
    ]);
    const acts = (actions ?? []) as { status: string }[];
    setStats({
      total: acts.length,
      ok: acts.filter((a) => a.status === "succeeded").length,
      failed: acts.filter((a) => a.status === "failed").length,
      verifFail: (verifs ?? []).filter((v) => (v as { overall: string }).overall === "failed").length,
      retries: Math.max(0, acts.length - 1),
    });
    setLoaded(true);
  };

  const breaker = caseRow.circuit_breaker;
  const state = breaker?.tripped ? "PAUSED" : (stats?.failed ?? 0) >= 2 || caseRow.status === "action_failed" ? "WARNING" : "NORMAL";
  const tone = state === "PAUSED" ? "danger" : state === "WARNING" ? "warning" : "success";

  return (
    <SectionCard
      title="Circuit Breaker Monitor"
      icon={<Gauge className={`h-4 w-4 text-${tone}`} />}
      action={<Badge className={classNames(state === "PAUSED" && "bg-danger-soft text-danger", state === "WARNING" && "bg-warning-soft text-warning", state === "NORMAL" && "bg-success-soft text-success")}>{state}</Badge>}
    >
      {!loaded ? (
        <Button size="sm" variant="outline" onClick={() => void load()}>Load breaker stats</Button>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <Stat label="Total actions" value={stats.total} />
          <Stat label="Successful" value={stats.ok} />
          <Stat label="Failed" value={stats.failed} />
          <Stat label="Verification failures" value={stats.verifFail} />
          <Stat label="Retry count" value={stats.retries} />
          <div className="rounded bg-muted/40 px-2 py-1">
            <div className="text-muted-foreground">Circuit state</div>
            <div className="font-semibold">{state}</div>
          </div>
        </div>
      ) : null}
      {breaker?.tripped && (
        <div className="mt-2 rounded bg-danger-soft px-2 py-1.5 text-xs font-medium text-danger">
          {breaker.reason ?? "Repeated action failure — automation paused"} ({breaker.attempts}/{breaker.limit})
        </div>
      )}
    </SectionCard>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-muted/40 px-2 py-1">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 3. What-If Simulation Mode (never writes; runs the real gate engine)
// ---------------------------------------------------------------------
export function SimulationPanel({ customerTier, evidenceSources }: { customerTier: string; evidenceSources?: string[] }) {
  const sources = evidenceSources ?? [];
  const [sim, setSim] = useState({
    amount: 7500,
    tier: customerTier,
    evidenceCount: 4,
    policyAllowed: true,
    contradictions: 0,
    repeatContacts: 1,
    actionFailures: 0,
  });
  const [result, setResult] = useState<{ gates: Record<string, GateResult>; canAutoResolve: boolean } | null>(null);

  const run = () => {
    const policyEval = { policyId: "POL-REF-01", allowed: sim.policyAllowed };
    const gateInputs = {
      evidence: Array.from({ length: Math.min(8, sim.evidenceCount) }, (_, i) => ({
        id: `sim-${i}`,
        source: sources[i % Math.max(1, sources.length)] ?? "simulated",
        type: "simulated",
        label: "Simulated evidence",
        value: i,
        known: true,
      })),
      action: "issue_refund",
      amount: sim.amount,
      customerTier: sim.tier,
      staffRole: null,
      policyAllowed: policyEval.allowed,
      policyId: policyEval.policyId,
      contradictions: sim.contradictions,
      repeatContacts: sim.repeatContacts,
      sentiment: "negative",
      uncertainty: 0.2,
      highValueCustomer: false,
      hasDuplicates: true,
      actionFailures: sim.actionFailures,
    };
    const g = evaluateAllGates(gateInputs);
    setResult({ gates: g.gates, canAutoResolve: g.canAutoResolve });
  };

  return (
    <SectionCard title="Simulation Mode" icon={<Gauge className="h-4 w-4 text-brand" />}>
      <div className="text-[11px] text-muted-foreground">Simulation never modifies real records — it runs the real Four-Gate Controller on simulated inputs.</div>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
        <Labeled label="Refund amount (₹)">
          <Input type="number" value={sim.amount} onChange={(e) => setSim({ ...sim, amount: Number(e.target.value) })} className="h-8" />
        </Labeled>
        <Labeled label="Customer tier">
          <select value={sim.tier} onChange={(e) => setSim({ ...sim, tier: e.target.value })} className="h-8 w-full rounded-md border bg-background px-2">
            {["standard", "premium", "gold"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Evidence completeness">
          <Input type="number" min={0} max={8} value={sim.evidenceCount} onChange={(e) => setSim({ ...sim, evidenceCount: Number(e.target.value) })} className="h-8" />
        </Labeled>
        <Labeled label="Policy eligibility">
          <select value={sim.policyAllowed ? "yes" : "no"} onChange={(e) => setSim({ ...sim, policyAllowed: e.target.value === "yes" })} className="h-8 w-full rounded-md border bg-background px-2">
            <option value="yes">Eligible</option>
            <option value="no">Not eligible</option>
          </select>
        </Labeled>
        <Labeled label="Risk / contradictions">
          <select value={sim.contradictions} onChange={(e) => setSim({ ...sim, contradictions: Number(e.target.value) })} className="h-8 w-full rounded-md border bg-background px-2">
            <option value={0}>None</option>
            <option value={1}>1 contradiction</option>
          </select>
        </Labeled>
        <Labeled label="Previous contacts">
          <Input type="number" min={0} value={sim.repeatContacts} onChange={(e) => setSim({ ...sim, repeatContacts: Number(e.target.value) })} className="h-8" />
        </Labeled>
        <Labeled label="Action failure state">
          <select value={sim.actionFailures} onChange={(e) => setSim({ ...sim, actionFailures: Number(e.target.value) })} className="h-8 w-full rounded-md border bg-background px-2">
            <option value={0}>No failures</option>
            <option value={2}>2 prior failures</option>
            <option value={3}>3 prior failures</option>
          </select>
        </Labeled>
      </div>
      <Button size="sm" className="mt-3" onClick={run}>Run simulation</Button>
      {result && (
        <div className="mt-3 rounded border px-2.5 py-2">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">Refund: {inr(sim.amount)}</span>
            {Object.entries(result.gates).map(([k, g]) => (
              <Badge key={k} className={classNames(g.status === "PASS" && "bg-success-soft text-success", g.status === "FAIL" && "bg-danger-soft text-danger", g.status === "REVIEW" && "bg-warning-soft text-warning", g.status === "BLOCK" && "bg-danger-soft text-danger")}>
                {k}: {g.status}
              </Badge>
            ))}
          </div>
          <div className="mt-1.5 text-xs">
            <b>Decision:</b>{" "}
            {result.canAutoResolve ? (
              <span className="text-success">Autonomous action permitted.</span>
            ) : (
              <span className="text-warning">Human approval required.</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{Object.values(result.gates).map((g) => `${g.name}: ${g.detail}`).join(" · ")}</div>
        </div>
      )}
    </SectionCard>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
