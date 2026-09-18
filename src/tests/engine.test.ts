import { describe, it, expect } from "vitest";
import { classifyMessage, routeTicket, fallbackResponse } from "../../supabase/functions/resolveai/_shared/engine/classify";
import { evaluateAllGates, evaluateAuthorityGate } from "../../supabase/functions/resolveai/_shared/engine/gates";
import { computeEscalation } from "../../supabase/functions/resolveai/_shared/engine/escalation";
import { detectContradictions, matchFingerprint, evaluateCircuitBreaker } from "../../supabase/functions/resolveai/_shared/engine/safety";
import { evaluatePolicy } from "../../supabase/functions/resolveai/_shared/engine/policy";
import { computeCustomerEffort } from "../../supabase/functions/resolveai/_shared/engine/effort";
import { assessUncertainty } from "../../supabase/functions/resolveai/_shared/engine/uncertainty";
import { computeTrend } from "../../supabase/functions/resolveai/_shared/engine/trends";

describe("intent classification (deterministic)", () => {
  it("detects duplicate-charge billing complaint", () => {
    const u = classifyMessage("I was charged twice for my order. The order is still pending and I already contacted support twice.");
    expect(u.intent).toBe("billing");
    expect(u.subIntents).toContain("duplicate_charge");
    expect(u.sentiment).toBe("negative");
    expect(u.urgency).toBe("high");
  });

  it("detects missing package delivery complaint", () => {
    const u = classifyMessage("The courier says delivered but I never received my package.");
    expect(u.intent).toBe("order");
    expect(u.subIntents).toContain("missing_package");
    expect(u.sentiment).toBe("negative");
  });

  it("detects login / account complaints", () => {
    const u = classifyMessage("I cannot login to my account, my password is not working.");
    expect(u.intent).toBe("account");
    expect(u.subIntents).toContain("login");
  });
});

describe("ticket router", () => {
  it("routes billing duplicates to the billing specialist", () => {
    const r = routeTicket({
      message: "I was charged twice for my order",
      customerRepeatContacts: 2,
      llmUnderstanding: null,
    });
    expect(r.specialist).toBe("billing");
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it("LLM understanding is fused but constrained to valid intents", () => {
    const r = routeTicket({
      message: "my order never arrived",
      customerRepeatContacts: 0,
      llmUnderstanding: { intent: "order", confidence: 0.99, urgency: "high", sentiment: "negative" },
    });
    expect(r.intent).toBe("order");
    expect(r.confidence).toBeLessThanOrEqual(0.99);
  });
});

describe("four-gate controller", () => {
  const baseEvidence = [
    { id: "e1", source: "payments", type: "payment", label: "txn A", value: "A", known: true },
    { id: "e2", source: "orders", type: "order", label: "order X", value: "X", known: true },
  ];

  it("passes all gates for an authorized duplicate refund (gold tier, ₹2,499)", () => {
    const g = evaluateAllGates({
      evidence: baseEvidence,
      action: "issue_refund",
      amount: 2499,
      customerTier: "gold",
      staffRole: null,
      policyAllowed: true,
      policyId: "POL-REF-01",
      contradictions: 0,
      repeatContacts: 2,
      sentiment: "negative",
      uncertainty: 0.1,
      highValueCustomer: true,
      hasDuplicates: true,
      actionFailures: 0,
    });
    expect(g.gates.evidence.status).toBe("PASS");
    expect(g.gates.policy.status).toBe("PASS");
    expect(g.gates.authority.status).toBe("PASS");
    expect(g.gates.risk.status).toBe("PASS");
    expect(g.canAutoResolve).toBe(true);
  });

  it("blocks a refund above the standard-tier authority limit", () => {
    const g = evaluateAuthorityGate({
      action: "issue_refund",
      amount: 2499,
      customerTier: "standard",
      staffRole: null,
    });
    expect(g.status).toBe("FAIL");
  });

  it("allows a refund within the Tier-2 agent limit", () => {
    const g = evaluateAuthorityGate({
      action: "issue_refund",
      amount: 2499,
      customerTier: "standard",
      staffRole: "customer_support_t2",
    });
    expect(g.status).toBe("PASS");
  });

  it("blocks autonomous action when evidence is insufficient", () => {
    const g = evaluateAllGates({
      evidence: [],
      action: "issue_refund",
      amount: 2499,
      customerTier: "gold",
      staffRole: null,
      policyAllowed: false,
      policyId: null,
      contradictions: 0,
      repeatContacts: 0,
      sentiment: "neutral",
      uncertainty: 0.8,
      highValueCustomer: false,
      hasDuplicates: false,
      actionFailures: 0,
    });
    expect(g.gates.evidence.status).toBe("FAIL");
    expect(g.canAutoResolve).toBe(false);
  });
});

describe("contradiction detection", () => {
  it("detects a delivery contradiction when GPS does not match", () => {
    const contradictions = detectContradictions({
      orderStatus: "delivered",
      shipmentStatus: "delivered",
      courier: "Delhivery",
      gps: { matched: false, distanceKm: 2.1 },
      customerClaimsNotReceived: true,
    });
    expect(contradictions.length).toBe(1);
    expect(contradictions[0].decision).toBe("AUTO-RESOLUTION BLOCKED");
    expect(contradictions[0].evidence.map((e) => e.source)).toContain("GPS");
  });

  it("does not flag a clean delivery as a contradiction", () => {
    const contradictions = detectContradictions({
      orderStatus: "delivered",
      shipmentStatus: "delivered",
      courier: "Delhivery",
      gps: { matched: true },
      customerClaimsNotReceived: false,
    });
    expect(contradictions.length).toBe(0);
  });
});

describe("escalation scoring", () => {
  it("escalates high when evidence conflicts", () => {
    const esc = computeEscalation({
      intent: "order",
      caseComplexity: 0.7,
      repeatContacts: 2,
      sentiment: "negative",
      financialImpact: 0,
      policyUncertainty: false,
      conflictingEvidence: true,
      aiConfidence: 0.9,
      actionFailures: 0,
      slaRisk: false,
    });
    expect(esc.score).toBeGreaterThanOrEqual(40);
    expect(esc.reasons.join(" ")).toContain("Contradictory");
  });

  it("escalates when AI confidence is below the floor", () => {
    const esc = computeEscalation({
      intent: "billing",
      caseComplexity: 0.3,
      repeatContacts: 0,
      sentiment: "neutral",
      financialImpact: 5000,
      policyUncertainty: true,
      conflictingEvidence: false,
      aiConfidence: 0.45,
      actionFailures: 0,
      slaRisk: false,
    });
    expect(esc.score).toBeGreaterThanOrEqual(15);
    expect(esc.reasons.join(" ")).toContain("confidence");
  });
});

describe("circuit breaker", () => {
  it("trips after three consecutive failures", () => {
    const history = [
      { action: "issue_refund", status: "failed" },
      { action: "issue_refund", status: "failed" },
      { action: "issue_refund", status: "failed" },
    ];
    const b = evaluateCircuitBreaker(history, "issue_refund", 3);
    expect(b.tripped).toBe(true);
    expect(b.attempts).toBe(3);
    expect(b.reason).toContain("automation paused");
  });

  it("does not trip before the limit", () => {
    const b = evaluateCircuitBreaker(
      [{ action: "issue_refund", status: "failed" }],
      "issue_refund",
      3,
    );
    expect(b.tripped).toBe(false);
  });
});

describe("failure fingerprint matching", () => {
  const fps = [
    {
      fingerprint_id: "FP-01",
      name: "Payment/Order Sync",
      symptoms: ["payment_gateway_timeout", "duplicate_transaction", "order_still_pending"],
      affected_system: "payment-order-sync",
      probable_root_cause: "gateway timeout",
      severity: "high",
      recommended_recovery: "refund",
    },
  ];
  it("matches a duplicate-charge symptom set to the sync fingerprint", () => {
    const m = matchFingerprint(["duplicate_transaction", "order_still_pending"], fps);
    expect(m).not.toBeNull();
    expect(m!.fingerprint.fingerprint_id).toBe("FP-01");
    expect(m!.matchedSymptoms.length).toBe(2);
  });
  it("returns null when no symptom matches", () => {
    const m = matchFingerprint(["login_failure"], fps);
    expect(m).toBeNull();
  });
});

describe("policy evaluation", () => {
  const policy = {
    policy_id: "POL-REF-01",
    name: "Duplicate Payment Refund",
    category: "refund",
    description: "x",
    conditions: { two_successful_payments_same_order: true, amount_within_authority: true },
    allowed_actions: ["issue_refund"],
    restrictions: [],
    authority_limits: { tier1: 1000, tier2: 5000, manager: 50000 },
  };

  it("permits the refund when conditions hold", () => {
    const r = evaluatePolicy([policy as never], "issue_refund", {
      twoSuccessfulPaymentsSameOrder: true,
      amount: 2499,
      amountWithinAuthority: true,
      orderPending: true,
      within30Days: true,
      deliveryEvidenceComplete: true,
      noContradiction: true,
      identityVerified: true,
      defectConfirmed: false,
      fraudRisk: "low",
    });
    expect(r.allowed).toBe(true);
    expect(r.policyId).toBe("POL-REF-01");
  });

  it("denies the refund when the duplicate condition is absent", () => {
    const r = evaluatePolicy([policy as never], "issue_refund", {
      twoSuccessfulPaymentsSameOrder: false,
      amount: 2499,
      amountWithinAuthority: true,
      orderPending: true,
      within30Days: true,
      deliveryEvidenceComplete: true,
      noContradiction: true,
      identityVerified: true,
      defectConfirmed: false,
      fraudRisk: "low",
    });
    expect(r.allowed).toBe(false);
  });

  it("denies actions with no governing policy", () => {
    const r = evaluatePolicy([policy as never], "initiate_replacement", {
      twoSuccessfulPaymentsSameOrder: true,
      amount: 0,
      amountWithinAuthority: true,
      orderPending: false,
      within30Days: true,
      deliveryEvidenceComplete: true,
      noContradiction: true,
      identityVerified: true,
      defectConfirmed: true,
      fraudRisk: "low",
    });
    expect(r.allowed).toBe(false);
    expect(r.policyId).toBeNull();
  });
});

describe("fallback response", () => {
  it("never claims a refund when the case was escalated", () => {
    const r = fallbackResponse(false, {
      customerName: "Priya",
      intent: "billing",
      escalated: true,
    });
    expect(r.toLowerCase()).not.toContain("refund of");
  });
});

describe("customer effort score (computed from real records)", () => {
  it("scores a single-contact resolved case as LOW effort", () => {
    const r = computeCustomerEffort({ contacts: 1, transfers: 0, infoRequests: 0, resolutionHours: 2, failedActions: 0, escalations: 0 });
    expect(r.score).toBeLessThanOrEqual(1.6);
    expect(r.label).toBe("LOW");
  });

  it("scores a multi-contact, escalated, failed-action case as HIGH effort", () => {
    const r = computeCustomerEffort({ contacts: 5, transfers: 2, infoRequests: 3, resolutionHours: 72, failedActions: 3, escalations: 2 });
    expect(r.score).toBeGreaterThanOrEqual(3.6);
    expect(r.label).toBe("VERY HIGH");
    expect(r.factors.some((f) => f.name === "Failed actions")).toBe(true);
  });
});

describe("uncertainty assessment", () => {
  it("blocks auto-resolution when evidence is conflicting", () => {
    const u = assessUncertainty({ aiConfidence: 0.9, evidenceCount: 4, expectedEvidence: 5, contradictions: 1, policyCertain: true, actionRisk: "low" });
    expect(u.blockAutoResolution).toBe(true);
    expect(u.level).toBe("HIGH");
    expect(u.recommendHumanReview).toBe(true);
  });

  it("blocks auto-resolution when confidence is below threshold", () => {
    const u = assessUncertainty({ aiConfidence: 0.45, evidenceCount: 5, expectedEvidence: 5, contradictions: 0, policyCertain: true, actionRisk: "low" });
    expect(u.blockAutoResolution).toBe(true);
    expect(u.reason).toContain("below the safe threshold");
  });

  it("reports missing evidence when incomplete", () => {
    const u = assessUncertainty({ aiConfidence: 0.85, evidenceCount: 1, expectedEvidence: 5, contradictions: 0, policyCertain: false, actionRisk: "low" });
    expect(u.evidenceCompleteness).toBeLessThan(0.5);
    expect(u.missingEvidence.length).toBeGreaterThan(0);
  });
});

describe("recurring / emerging issue detection", () => {
  it("flags a potential incident when the recent rate climbs sharply", () => {
    const t = computeTrend({ currentCount: 6, baselineCount: 1, baselineWindowCount: 100, currentWindowCount: 100, affectedCustomers: ["a", "b", "c"], relatedSystems: ["payment-order-sync"] });
    expect(t.direction).toBe("emerging");
    expect(t.potentialIncident).toBe(true);
    expect(t.changePct).toBeGreaterThanOrEqual(40);
  });

  it("marks stable patterns as stable", () => {
    const t = computeTrend({ currentCount: 5, baselineCount: 5, baselineWindowCount: 100, currentWindowCount: 100, affectedCustomers: ["a"], relatedSystems: ["logistics"] });
    expect(t.direction).toBe("stable");
    expect(t.potentialIncident).toBe(false);
  });
});
