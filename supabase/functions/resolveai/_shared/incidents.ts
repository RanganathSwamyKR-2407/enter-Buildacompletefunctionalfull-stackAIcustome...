// =====================================================================
// ResolveAI — incident detection from failure fingerprints
// (Deno only)
// =====================================================================
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { matchFingerprint } from "./engine/safety.ts";
import type { Fingerprint } from "./engine/safety.ts";

const INCIDENT_THRESHOLD = 5;

/**
 * Match a case's symptoms against known failure fingerprints. When a
 * fingerprint's frequency crosses the incident threshold, create/refresh
 * an incident and link the case.
 */
export async function detectAndRecordIncident(
  db: SupabaseClient,
  caseUuid: string,
  symptoms: string[],
  rootCauseLabel: string | null,
): Promise<void> {
  const { data: fingerprints } = await db
    .from("resolveai_failure_fingerprints")
    .select("*");
  if (!fingerprints || fingerprints.length === 0) return;

  const match = matchFingerprint(symptoms, fingerprints as unknown as Fingerprint[]);
  if (!match) return;

  const fp = match.fingerprint;

  // Increment frequency
  const { data: fpRow } = await db
    .from("resolveai_failure_fingerprints")
    .select("frequency")
    .eq("fingerprint_id", fp.fingerprint_id)
    .maybeSingle();
  const newFreq = ((fpRow as { frequency?: number } | null)?.frequency ?? fp.frequency) + 1;
  await db
    .from("resolveai_failure_fingerprints")
    .update({ frequency: newFreq })
    .eq("fingerprint_id", fp.fingerprint_id);

  const isIncident = newFreq >= INCIDENT_THRESHOLD;
  if (!isIncident) return;

  // Upsert incident by fingerprint
  const incidentName =
    fp.affected_system === "payment-order-sync"
      ? "Payment Gateway Duplicate Debits"
      : fp.affected_system === "logistics"
        ? "Delivery GPS Discrepancies"
        : `${fp.name} (detected)`;

  const { data: existing } = await db
    .from("resolveai_incidents")
    .select("id")
    .eq("fingerprint_id", (fp as unknown as { id: string }).id ?? "")
    .maybeSingle();

  let incidentUuid: string;
  if (existing) {
    incidentUuid = (existing as { id: string }).id;
    const { data: linked } = await db
      .from("resolveai_incident_cases")
      .select("case_id")
      .eq("incident_id", incidentUuid);
    const linkedIds = (linked ?? []).map((r) => (r as { case_id: string }).case_id);
    if (!linkedIds.includes(caseUuid)) {
      await db.from("resolveai_incident_cases").insert({ incident_id: incidentUuid, case_id: caseUuid });
    }
    const count = linkedIds.length + 1;
    await db
      .from("resolveai_incidents")
      .update({
        affected_case_count: count,
        updated_at: new Date().toISOString(),
        name: incidentName,
        severity: fp.severity === "critical" ? "critical" : fp.severity === "high" ? "high" : "medium",
      })
      .eq("id", incidentUuid);
  } else {
    const { data: fpFull } = await db
      .from("resolveai_failure_fingerprints")
      .select("id")
      .eq("fingerprint_id", fp.fingerprint_id)
      .maybeSingle();
    const { data: newInc } = await db
      .from("resolveai_incidents")
      .insert({
        incident_id: `INC-${String(Math.floor(8000 + Math.random() * 999)).slice(0, 4)}`,
        fingerprint_id: (fpFull as { id: string }).id,
        name: incidentName,
        status: "active",
        affected_case_count: 1,
        first_detected_at: new Date().toISOString(),
        severity: fp.severity === "critical" ? "critical" : fp.severity === "high" ? "high" : "medium",
        recommended_response: fp.recommended_recovery,
      })
      .select("id")
      .single();
    incidentUuid = (newInc as { id: string }).id;
    await db.from("resolveai_incident_cases").insert({ incident_id: incidentUuid, case_id: caseUuid });
  }
  console.log(`incident: case ${caseUuid} linked to fingerprint ${fp.fingerprint_id} (${rootCauseLabel ?? "unknown root cause"})`);
}
