// =====================================================================
// ResolveAI engine — Customer Effort Score (pure TS)
// Computed from actual case records; never hardcoded.
// Higher score = more effort the customer had to expend.
// =====================================================================
export interface EffortInputs {
  contacts: number; // support contacts (tickets + cases)
  transfers: number; // escalations / queue transfers
  infoRequests: number; // inferred from messages asking for status/update
  resolutionHours: number; // time between first contact and resolution
  failedActions: number; // failed automated actions on the case
  escalations: number; // escalation count
}

export interface EffortResult {
  score: number; // 1 (low effort) .. 5 (high effort)
  label: "LOW" | "MODERATE" | "HIGH" | "VERY HIGH";
  factors: { name: string; weight: number; detail: string }[];
}

export function computeCustomerEffort(inputs: EffortInputs): EffortResult {
  const factors: EffortResult["factors"] = [];

  // Contacts: baseline 1 contact is expected; more = more effort.
  const contactFactor = Math.max(0, inputs.contacts - 1);
  factors.push({
    name: "Repeat contacts",
    weight: Math.min(1.0, contactFactor * 0.4),
    detail: `${inputs.contacts} contact(s)`,
  });

  const transferFactor = inputs.transfers + inputs.escalations;
  factors.push({
    name: "Transfers / escalations",
    weight: Math.min(1.0, transferFactor * 0.5),
    detail: `${transferFactor} transfer(s)/escalation(s)`,
  });

  const hoursFactor = Math.max(0, inputs.resolutionHours - 2);
  factors.push({
    name: "Resolution time",
    weight: Math.min(1.0, hoursFactor / 48),
    detail: `${Math.round(inputs.resolutionHours)}h to resolve`,
  });

  const failedFactor = inputs.failedActions;
  factors.push({
    name: "Failed actions",
    weight: Math.min(1.0, failedFactor * 0.6),
    detail: `${failedFactor} failed automated action(s)`,
  });

  const infoFactor = inputs.infoRequests;
  factors.push({
    name: "Status follow-ups",
    weight: Math.min(0.6, infoFactor * 0.2),
    detail: `${infoFactor} status inquiry(ies)`,
  });

  const totalWeight = factors.reduce((n, f) => n + f.weight, 0);
  // Score 1..5
  const score = Math.round((1 + Math.min(4, totalWeight)) * 10) / 10;

  return {
    score,
    label: score <= 1.6 ? "LOW" : score <= 2.6 ? "MODERATE" : score <= 3.6 ? "HIGH" : "VERY HIGH",
    factors,
  };
}
