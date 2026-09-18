// =====================================================================
// ResolveAI engine — recurring / emerging issue detection (pure TS)
// Compares current frequency of a fingerprint against a baseline window
// using real case records.
// =====================================================================
export interface TrendInputs {
  currentCount: number; // matching cases in the recent window
  baselineCount: number; // matching cases in the older (baseline) window
  baselineWindowCount: number; // total cases in baseline window
  currentWindowCount: number; // total cases in current window
  affectedCustomers: string[];
  relatedSystems: string[];
}

export interface TrendResult {
  currentFrequency: number;
  baselineFrequency: number;
  changePct: number; // (current - baseline) / baseline
  ratio: number;
  direction: "stable" | "declining" | "emerging";
  potentialIncident: boolean;
  severity: "low" | "medium" | "high";
  reason: string;
}

export function computeTrend(inputs: TrendInputs): TrendResult {
  const currentRate = inputs.currentWindowCount > 0 ? inputs.currentCount / inputs.currentWindowCount : 0;
  const baselineRate = inputs.baselineWindowCount > 0 ? inputs.baselineCount / inputs.baselineWindowCount : 0;
  const changePct = baselineRate > 0 ? Math.round(((currentRate - baselineRate) / baselineRate) * 100) : currentRate > 0 ? 100 : 0;
  const ratio = baselineRate > 0 ? currentRate / baselineRate : currentRate > 0 ? 1 : 0;

  let direction: TrendResult["direction"] = "stable";
  if (changePct >= 40 && currentCountIsSignificant(inputs)) direction = "emerging";
  else if (changePct <= -25) direction = "declining";

  const potentialIncident = direction === "emerging" && currentCountIsSignificant(inputs);
  const severity: TrendResult["severity"] = potentialIncident ? "high" : changePct >= 40 ? "medium" : "low";

  return {
    currentFrequency: inputs.currentCount,
    baselineFrequency: inputs.baselineCount,
    changePct,
    ratio: Math.round(ratio * 100) / 100,
    direction,
    potentialIncident,
    severity,
    reason:
      direction === "emerging"
        ? `Complaint rate up ${changePct}% vs baseline — potentially emerging issue across ${inputs.affectedCustomers.length} customer(s).`
        : direction === "declining"
          ? `Complaint rate down ${Math.abs(changePct)}% vs baseline.`
          : "Complaint rate is stable vs baseline.",
  };
}

function currentCountIsSignificant(inputs: TrendInputs): boolean {
  return inputs.currentCount >= 3;
}
