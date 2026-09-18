// =====================================================================
// ResolveAI engine — deterministic understanding + ticket router
// Pure TS. Used as the primary classification path and as the fallback
// when the LLM is unavailable. Fuses LLM output when provided.
// =====================================================================
import type { Understanding } from "./types.ts";

const BILLING_WORDS = [
  "charge", "charged", "twice", "double", "refund", "payment", "pay",
  "debit", "invoice", "billing", "money", "credit", "failed payment",
  "extra charge", "deducted",
];
const ORDER_WORDS = [
  "order", "delivery", "delivered", "shipped", "ship", "package", "parcel",
  "courier", "tracking", "return", "cancel", "cancelled", "missing",
  "received", "arrive", "deliver",
];
const TECHNICAL_WORDS = [
  "not working", "broken", "defect", "fault", "error", "app", "connect",
  "pairing", "sound", "battery", "charging", "display", "warranty", "repair",
];
const ACCOUNT_WORDS = [
  "login", "password", "account", "subscription", "renew", "sign in",
  "profile", "otp", "logged out", "subscription renewed",
];

const SUB_INTENT_MAP: [RegExp, string][] = [
  [/twice|double|duplicate|charged twice|debited twice/i, "duplicate_charge"],
  [/refund|money back|credit back/i, "refund"],
  [/never received|not received|missing package|not received my package/i, "missing_package"],
  [/deliver|courier|tracking|parcel|package/i, "delivery"],
  [/late|delay|delayed|not arrived/i, "late_delivery"],
  [/return/i, "return"],
  [/cancel|cancelled/i, "cancellation"],
  [/damaged|broken|defective|not working|fault/i, "damaged_item"],
  [/login|password|sign in|logged out|otp/i, "login"],
  [/subscription|renew/i, "subscription"],
  [/tracking/i, "tracking"],
  [/wrong (size|item|product)|received wrong/i, "wrong_item"],
  [/connect|pairing|bluetooth|earbuds|battery/i, "technical_failure"],
  [/invoice|charged extra|shipping charge/i, "shipping_charge"],
];

const NEGATIVE_WORDS = [
  "never", "not", "refused", "failed", "wrong", "missing", "charged", "twice",
  "damaged", "broken", "frustrated", "disappointed", "still", "again", "unhappy",
  "worst", "terrible", "poor",
];
const POSITIVE_WORDS = ["thanks", "thank you", "great", "good", "excellent", "happy", "pleased"];
const URGENT_WORDS = [
  "urgent", "twice", "already", "contacted", "immediately", "still", "not received",
  "never", "asap", "frustrated", "second time", "third time", "refund", "money",
];

function countMatches(text: string, words: string[]): number {
  const lower = text.toLowerCase();
  return words.reduce((n, w) => (lower.includes(w.toLowerCase()) ? n + 1 : n), 0);
}

function detectIntent(message: string): { intent: string; score: number } {
  const scores = {
    billing: countMatches(message, BILLING_WORDS),
    order: countMatches(message, ORDER_WORDS),
    technical: countMatches(message, TECHNICAL_WORDS),
    account: countMatches(message, ACCOUNT_WORDS),
  };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return { intent: best[0], score: best[1] };
}

function detectSubIntents(message: string): string[] {
  const found: string[] = [];
  for (const [re, sub] of SUB_INTENT_MAP) {
    if (re.test(message)) found.push(sub);
  }
  return found.length > 0 ? found : ["general"];
}

function detectSentiment(message: string): {
  sentiment: Understanding["sentiment"];
  sentimentScore: number;
} {
  const neg = countMatches(message, NEGATIVE_WORDS);
  const pos = countMatches(message, POSITIVE_WORDS);
  const score = Math.min(1, Math.max(0, 0.55 + pos * 0.15 - neg * 0.12));
  return {
    sentiment: score >= 0.6 ? "positive" : score >= 0.4 ? "neutral" : "negative",
    sentimentScore: Number(score.toFixed(2)),
  };
}

function detectUrgency(message: string, intent: string): Understanding["urgency"] {
  const urgentHits = countMatches(message, URGENT_WORDS);
  if (urgentHits >= 3) return "high";
  if (urgentHits >= 1) return "medium";
  return "low";
}

function computePriority(urgency: string, sentiment: string): string {
  if (urgency === "high") return sentiment === "negative" ? "P1" : "P2";
  if (urgency === "medium") return sentiment === "negative" ? "P2" : "P3";
  return "P4";
}

const ROUTING_REASON: Record<string, string> = {
  billing: "Payment discrepancy detected",
  order: "Order / delivery issue detected",
  technical: "Product or technical issue detected",
  account: "Account-related issue detected",
};

/** Deterministic understanding of a customer message. */
export function classifyMessage(
  message: string,
  customerRepeatContacts = 0,
): Omit<Understanding, "specialist"> {
  const intent = detectIntent(message);
  const subIntents = detectSubIntents(message);
  const senti = detectSentiment(message);
  const urgency = detectUrgency(message, intent.intent);
  const priority = computePriority(urgency, senti.sentiment);

  // Base confidence from keyword signal strength, adjusted for ambiguity.
  let confidence = 0.68 + Math.min(0.25, intent.score * 0.08);
  if (intent.score === 0) confidence = 0.45;
  if (customerRepeatContacts >= 2) confidence = Math.min(0.98, confidence + 0.04);

  return {
    intent: intent.intent,
    subIntents,
    urgency,
    sentiment: senti.sentiment,
    sentimentScore: senti.sentimentScore,
    priority,
    confidence: Number(confidence.toFixed(2)),
    routingReason: ROUTING_REASON[intent.intent] ?? "Generic support request",
  };
}

export interface RouterInput {
  message: string;
  customerRepeatContacts: number;
  llmUnderstanding?: Partial<Understanding> | null;
}

/** Ticket router: fuse deterministic classification with optional LLM output. */
export function routeTicket(input: RouterInput): Understanding {
  const det = classifyMessage(input.message, input.customerRepeatContacts);
  const llm = input.llmUnderstanding;

  const intent = llm?.intent && ["billing", "order", "technical", "account"].includes(llm.intent)
    ? llm.intent
    : det.intent;
  const subIntents = llm?.subIntents?.length
    ? llm.subIntents.slice(0, 4)
    : det.subIntents;
  const urgency = llm?.urgency ?? det.urgency;
  const sentiment = llm?.sentiment ?? det.sentiment;
  const confidence = llm?.confidence != null
    ? Math.max(0.5, Math.min(0.99, llm.confidence))
    : det.confidence;

  const specialistByIntent: Record<string, string> = {
    billing: "billing", order: "order", technical: "technical", account: "account",
  };

  return {
    intent,
    subIntents,
    urgency,
    sentiment,
    sentimentScore: llm?.sentimentScore ?? det.sentimentScore,
    priority: llm?.priority ?? computePriority(urgency, sentiment),
    confidence,
    specialist: specialistByIntent[intent] ?? "order",
    routingReason: llm?.routingReason ?? ROUTING_REASON[intent] ?? "Specialist match",
  };
}

/** Simple rule fallback for generating a customer response when the LLM is down. */
export function fallbackResponse(
  resolved: boolean,
  ctx: {
    customerName: string;
    intent: string;
    rootCause?: string | null;
    contradiction?: boolean;
    refundIssued?: boolean;
    escalated?: boolean;
  },
): string {
  const { customerName, intent } = ctx;
  if (ctx.contradiction) {
    return `Hi ${customerName}, we take this very seriously. Our systems flagged a discrepancy between the courier's delivery record and the GPS proof of delivery. Because of the conflicting evidence, our team has taken over the case to investigate personally. You will receive an update shortly.`;
  }
  if (ctx.escalated) {
    return `Hi ${customerName}, I'm sorry for the trouble. This case needs specialist review, so I've escalated it to our ${intent} support team with all the details. You'll hear from us shortly.`;
  }
  if (resolved && ctx.refundIssued) {
    return `Hi ${customerName}, I've verified the duplicate charge on your order and issued a refund of ₹2,499 to your original payment method. It should reflect within 5-7 business days. We've also flagged your order for correction. Thank you for your patience.`;
  }
  if (resolved) {
    return `Hi ${customerName}, your issue has been resolved. ${ctx.rootCause ? "Root cause: " + ctx.rootCause + ". " : ""}Let us know if you need anything else.`;
  }
  return `Hi ${customerName}, we're looking into your ${intent} issue. Our team will update you shortly.`;
}
