// =====================================================================
// ResolveAI — LLM module (DeepSeek V4 Flash · OpenAI Chat Completions)
// All calls are structured JSON extractions. Every call can fail safely:
// callers MUST fall back to the deterministic engine. The LLM only
// proposes understanding/hypotheses/response text — it never executes
// sensitive actions.
// =====================================================================
import type { Understanding } from "./engine/types.ts";

const AI_API_TOKEN = Deno.env.get("AI_API_TOKEN_774223bb88c5");
const AI_BASE = "https://api.enter.pro/code/api/v1/ai/chat/completions";
const ENTER_PROJECT_ID = "774223bb88c54f7c9c0176a4946bc05f";
const MODEL = "deepseek/deepseek-v4-flash";

const TIMEOUT_MS = 20000;

async function chatJSON(
  system: string,
  user: string,
  maxTokens = 900,
): Promise<unknown | null> {
  if (!AI_API_TOKEN) {
    console.warn("llm: AI_API_TOKEN missing — using deterministic fallback");
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(AI_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_TOKEN}`,
        "Content-Type": "application/json",
        "X-Enter-Project-ID": ENTER_PROJECT_ID,
        "X-Session-ID": crypto.randomUUID(),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        temperature: 0,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`llm: upstream ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const content: string | undefined = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn(`llm: call failed — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pick<T>(value: unknown, keys: string[], fallback: T): T {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of keys) {
      if (obj[k] != null) return obj[k] as T;
    }
  }
  return fallback;
}

const INTENTS = new Set(["billing", "order", "technical", "account"]);
const URGENCIES = new Set(["low", "medium", "high"]);
const SENTIMENTS = new Set(["positive", "neutral", "negative"]);

const UNDERSTAND_SYSTEM = [
  "You are the understanding layer of an autonomous customer-support system.",
  "Return STRICT JSON only (no markdown) with this exact shape:",
  '{"intent":"billing|order|technical|account","sub_intents":["..."],"urgency":"low|medium|high","sentiment":"positive|neutral|negative","sentimentScore":0..1,"priority":"P1|P2|P3|P4","confidence":0..1,"routingReason":"short phrase"}',
  "Base everything on the customer message and context provided.",
].join(" ");

export async function llmUnderstand(
  message: string,
  customerContext: string,
): Promise<Partial<Understanding> | null> {
  const userPrompt = [
    "Customer message:",
    '"""' + message + '"""',
    "",
    "Customer context:",
    customerContext,
  ].join("\n");
  const out = await chatJSON(UNDERSTAND_SYSTEM, userPrompt);
  if (!out || typeof out !== "object") return null;
  const obj = out as Record<string, unknown>;
  const intent = pick<string>(obj, ["intent"], "order");
  const urgency = pick<string>(obj, ["urgency"], "medium");
  const sentiment = pick<string>(obj, ["sentiment"], "neutral");
  return {
    intent: INTENTS.has(intent) ? intent : "order",
    subIntents: Array.isArray(obj.sub_intents)
      ? (obj.sub_intents as string[]).slice(0, 4)
      : [],
    urgency: URGENCIES.has(urgency) ? (urgency as Understanding["urgency"]) : "medium",
    sentiment: SENTIMENTS.has(sentiment)
      ? (sentiment as Understanding["sentiment"])
      : "neutral",
    sentimentScore: typeof obj.sentimentScore === "number"
      ? Math.min(1, Math.max(0, obj.sentimentScore))
      : 0.5,
    priority: /^P[1-4]$/.test(pick<string>(obj, ["priority"], "P3"))
      ? pick<string>(obj, ["priority"], "P3")
      : "P3",
    confidence: typeof obj.confidence === "number"
      ? Math.min(0.99, Math.max(0.3, obj.confidence))
      : 0.7,
    routingReason: pick<string>(obj, ["routingReason"], "Specialist match"),
  };
}

export interface HypothesisLLM {
  hypotheses: { title: string; reasoning: string; confidence: number }[];
  root_cause: string;
}

const HYPOTHESIS_SYSTEM = [
  "You are the root-cause analysis layer of an autonomous customer-support system.",
  "Return STRICT JSON only (no markdown) with this exact shape:",
  '{"hypotheses":[{"title":"...","reasoning":"...","confidence":0..1}],"root_cause":"single concise root-cause statement"}',
  "Generate 2-4 ranked hypotheses. Distinguish FACTS (from evidence) from INFERENCES in your reasoning. Never invent facts.",
].join(" ");

export async function llmHypothesize(
  message: string,
  evidenceSummary: string,
): Promise<HypothesisLLM | null> {
  const userPrompt = [
    "Customer complaint:",
    '"""' + message + '"""',
    "",
    "Collected evidence:",
    evidenceSummary,
  ].join("\n");
  const out = await chatJSON(HYPOTHESIS_SYSTEM, userPrompt, 1200);
  if (!out || typeof out !== "object") return null;
  const obj = out as Record<string, unknown>;
  const hyps = Array.isArray(obj.hypotheses) ? (obj.hypotheses as HypothesisLLM["hypotheses"]) : [];
  return {
    hypotheses: hyps.slice(0, 4).map((h) => ({
      title: String(h.title ?? "Hypothesis"),
      reasoning: String(h.reasoning ?? ""),
      confidence: typeof h.confidence === "number" ? Math.min(0.99, Math.max(0, h.confidence)) : 0.5,
    })),
    root_cause: String(obj.root_cause ?? "Unable to determine root cause"),
  };
}

const RESPOND_SYSTEM = [
  "You write the customer-facing reply for an autonomous customer-support platform.",
  'Return STRICT JSON only: {"reply":"<text>"}',
  "Be warm, professional, concise (4-7 sentences max). Ground every claim strictly in the context provided.",
  "If the case was escalated, say a specialist team is taking over and make no promise of a refund.",
  "If a refund was issued and verified, state the amount and expected timeline.",
  "Never invent details not in the context.",
].join(" ");

export async function llmRespond(
  customerName: string,
  context: string,
): Promise<string | null> {
  const userPrompt = ["Customer:", customerName, "", "Case context:", context].join("\n");
  const out = await chatJSON(RESPOND_SYSTEM, userPrompt, 600);
  if (!out || typeof out !== "object") return null;
  return pick<string>(out, ["reply"], "");
}
