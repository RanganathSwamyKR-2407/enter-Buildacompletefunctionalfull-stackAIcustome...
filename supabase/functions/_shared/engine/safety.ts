// =====================================================================
// ResolveAI engine — contradiction detection, fingerprint matching,
// circuit breaker. Pure TS.
// =====================================================================
import type { Contradiction } from "./types.ts";

// ---------------------------------------------------------------------
// Contradiction detection
// ---------------------------------------------------------------------
export interface DeliveryEvidence {
  orderStatus: string | null;
  shipmentStatus: string | null;
  courier?: string | null;
  gps: { matched?: boolean; distanceKm?: number; note?: string } | null;
  customerClaimsNotReceived: boolean;
}

export function detectContradictions(
  delivery: DeliveryEvidence | null,
): Contradiction[] {
  const found: Contradiction[] = [];

  if (delivery) {
    const delivered =
      delivery.orderStatus === "delivered" && delivery.shipmentStatus === "delivered";

    if (delivered && delivery.customerClaimsNotReceived) {
      if (delivery.gps && delivery.gps.matched === false) {
        found.push({
          id: "CTR-DLV-001",
          type: "delivery_contradiction",
          label: "Courier reports delivered, customer disputes, GPS location mismatch",
          evidence: [
            { source: "Order DB", value: "delivered" },
            { source: "Courier", value: `delivered (${delivery.courier ?? "unknown"})` },
            {
              source: "GPS",
              value: delivery.gps.distanceKm
                ? `delivery location ${delivery.gps.distanceKm} km from customer home (${delivery.gps.note ?? "no note"})`
                : "delivery location does not match customer home",
            },
          ],
          decision: "AUTO-RESOLUTION BLOCKED",
        });
      } else if (!delivery.gps || delivery.gps.matched == null) {
        found.push({
          id: "CTR-DLV-002",
          type: "delivery_evidence_missing",
          label: "Delivery confirmed but GPS proof-of-delivery unavailable",
          evidence: [
            { source: "Order DB", value: "delivered" },
            { source: "Courier", value: `delivered (${delivery.courier ?? "unknown"})` },
            { source: "GPS", value: "proof-of-delivery coordinates not recorded" },
          ],
          decision: "AUTO-RESOLUTION BLOCKED",
        });
      }
    }
  }

  return found;
}

// ---------------------------------------------------------------------
// Failure fingerprint matching
// ---------------------------------------------------------------------
export interface Fingerprint {
  fingerprint_id: string;
  name: string;
  symptoms: string[];
  affected_system: string;
  probable_root_cause: string;
  severity: string;
  recommended_recovery: string;
}

export interface FingerprintMatch {
  fingerprint: Fingerprint;
  coverage: number; // matched symptoms / total symptoms
  matchedSymptoms: string[];
}

export function matchFingerprint(
  symptoms: string[],
  fingerprints: Fingerprint[],
): FingerprintMatch | null {
  let best: FingerprintMatch | null = null;
  for (const fp of fingerprints) {
    const matched = symptoms.filter((s) => fp.symptoms.includes(s));
    const coverage = fp.symptoms.length ? matched.length / fp.symptoms.length : 0;
    if (matched.length > 0 && (!best || coverage > best.coverage)) {
      best = { fingerprint: fp, coverage, matchedSymptoms: matched };
    }
  }
  return best;
}

// ---------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------
export interface BreakerResult {
  tripped: boolean;
  attempts: number;
  limit: number;
  reason: string | null;
}

export function evaluateCircuitBreaker(
  actionHistory: { action: string; status: string }[],
  actionName: string,
  limit = 3,
): BreakerResult {
  const attempts = actionHistory.filter(
    (a) => a.action === actionName && a.status === "failed",
  ).length;
  return {
    tripped: attempts >= limit,
    attempts,
    limit,
    reason: attempts >= limit ? "Repeated action failure — automation paused" : null,
  };
}
