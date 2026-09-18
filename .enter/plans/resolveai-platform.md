# ResolveAI — Autonomous Customer Support & Resolution Platform

## Context

The user wants a complete, working, full-stack autonomous AI customer-support platform ("ResolveAI") that goes far beyond a chatbot: intent/context understanding, multi-source investigation, RAG-grounded reasoning, multi-agent orchestration, a four-gate controller before any autonomous action, action verification, human escalation with a Resolution Passport, failure-fingerprint/incident detection, circuit breaker, and operational analytics. Three demo tracks (autonomous refund, contradiction → escalation, circuit breaker → escalation) must run end-to-end against seeded data.

**Platform adaptations (questions were cancelled; recommended defaults applied):**
- Python + FastAPI + Docker are not runnable on this platform. Backend is built on **Enter Cloud** (managed PostgreSQL + backend functions, TypeScript/Deno). The FastAPI endpoint spec maps 1:1 to backend functions. Docker is not provided (would be non-runnable); `.env.example` + README document the managed secrets instead.
- LLM default: **DeepSeek V4 Flash** (economical, fast, agentic). Actual protocol reference will be loaded from the LLM skill during implementation. LLM is used for understanding (intent/sub-intents/urgency/sentiment), root-cause hypotheses, and customer responses — with **deterministic fallbacks** so every demo track runs even if the LLM is down (a requirement, not a workaround).
- RAG: no embeddings endpoint is available on this platform, so retrieval is **PostgreSQL full-text search** (`websearch_to_tsquery` + `ts_rank_cd`) over seeded knowledge chunks, plus deterministic policy lookup. Sources, sections, scores, and relevance reasons are displayed in the Glass Box Console. No fabricated policies — every policy decision reads from the `resolveai_policies` table.
- Auth: full email/password login with seeded demo accounts (Customer / Tier-1 / Tier-2 / Manager / Admin), RLS on all tables, role checks in backend functions.
- Real-time: Enter Cloud Realtime (WebSocket via `supabase-js` Postgres changes) on `resolveai_case_events`, so the investigation console animates live step-by-step.
- No prototype image was provided, so the UI follows the written spec: a professional, dense enterprise operations dashboard (dark sidebar, light content, semantic status colors, no gaming effects).

## Architecture

```
Customer message
  → resolveai-chat (backend function, orchestrator/supervisor)
      → Context Engine (customer 360, history, conversations)
      → Understanding (LLM intent/urgency/sentiment + deterministic fallback)
      → Ticket Router (specialist selection + reason + confidence)
      → Specialist Agents (billing/order/technical/account; structured plans + tool calls)
      → Evidence Fusion (multi-source: customers/orders/payments/tickets/products/knowledge/policy)
      → Root-Cause Analysis (deterministic dedup/contradiction checks + LLM hypotheses + confidence)
      → Failure Fingerprint match
      → Four-Gate Controller (Evidence / Policy / Authority / Risk)  [deterministic]
      → Contradiction detection → block auto-resolution if triggered
      → Action Engine (deterministic tools: issue_refund, update_ticket, send_message)
          → circuit breaker (max 3 attempts)
      → Verification (independent re-query)
      → Resolve OR Escalate (Resolution Passport)
      → Audit log + analytics events + Case Twin update
      → Realtime case_events streamed throughout  [drives the Glass Box Console]
```

**Safety model (mandatory):** the LLM only *proposes*. Every sensitive action executes through a deterministic, gated action tool in the backend function. Gates are evaluated from DB evidence + policy rows; authority from tier limits (`Tier-1 ≤ ₹1,000`, `Tier-2 ≤ ₹5,000`, `Manager > ₹5,000`); risk from fraud/financial/customer/uncertainty signals.

## Database (migration under `supabase/migrations/`)

All tables use the stable `resolveai_` prefix (new business module; must not touch existing tables/profiles). RLS enabled on every table in the same migration; realtime published via `ALTER PUBLICATION supabase_realtime ADD TABLE ...` for `resolveai_case_events`, `resolveai_cases`, `resolveai_escalations`, `resolveai_messages`.

- `resolveai_staff` — (user_id → auth.users, name, role: customer_support_t1 | customer_support_t2 | manager | admin)
- `resolveai_customers` — profile/tier (standard/premium/gold), lifetime_value, churn_risk, sentiment history, created_at
- `resolveai_conversations`, `resolveai_messages` (role: customer/ai/agent/system)
- `resolveai_cases` — the **Case Twin**: case_id, customer_id, conversation_id, intent, sub_intents, urgency, sentiment, priority, status, sla_deadline, specialist, routing_reason, routing_confidence, customer_history, order_ids, transaction_ids, ticket_ids, evidence (jsonb), hypotheses (jsonb), root_cause, root_cause_confidence, recommended_action, gates/policy_result/authority_result/risk_result (jsonb), verification_result, escalation_score, escalation_reasons, circuit_breaker state, contradiction_detected, action_history, agent_notes, resolution_status, resolution_passport (jsonb), timestamps
- `resolveai_case_events` — stage, label, status (running/ok/warn/error), result (jsonb), evidence_count, duration_ms, error, created_at → **realtime source**
- `resolveai_orders`, `resolveai_order_items`, `resolveai_products`
- `resolveai_payments` — includes `refund_api_sim_fail bool` (deterministic failure injection for the circuit-breaker track), `status`, `gateway`
- `resolveai_refunds` — refund_id, payment_id, case_id, amount, status, issued_at, verification (jsonb)
- `resolveai_tickets` — previous support tickets
- `resolveai_knowledge_documents`, `resolveai_knowledge_chunks` (content + generated `content_search tsvector`, GIN index)
- `resolveai_policies` — policy_id, name, category, conditions (jsonb), allowed_actions (jsonb), restrictions (jsonb), authority_limits (jsonb), effective_from
- `resolveai_agents` — agent_key, name, plan_steps (jsonb), allowed_tools (jsonb)
- `resolveai_agent_actions` — per-agent structured action records (status: proposed/executing/succeeded/failed/blocked)
- `resolveai_action_verifications` — checks (jsonb: {name, expected, actual, pass}), overall (passed/failed/unknown)
- `resolveai_escalations` — score, reasons, recommended_queue, priority, passport (jsonb)
- `resolveai_failure_fingerprints` — fingerprint_id, name, symptoms, affected_system, probable_root_cause, frequency, severity, recommended_recovery
- `resolveai_incidents` + `resolveai_incident_cases` (link to affected cases)
- `resolveai_analytics_events` — event_type, payload (jsonb)
- `resolveai_audit_logs` — timestamp, case_id, actor, agent, action, input/decision/evidence/policy/authority/risk/result/verification (jsonb)

Seed data (migration): ≥20 customers, 40 cases, 50 orders + items, 60 payments, 20 tickets, 10 products, 10 knowledge documents (chunked), 10 policies, 4 agents, fingerprints, 2 incidents, 3 escalations. Realistic ₹ amounts (₹499 / ₹1,299 / ₹2,499 / ₹5,999 / ₹12,499). Dense FK relationships so investigations produce meaningful results.

## Backend functions (`supabase/functions/`)

Shared (pure-TS, dependency-free so both Deno and Vitest can import): `_shared/engine/` — `classify.ts` (rule fallback intent/sub-intent/urgency/sentiment/priority), `router.ts`, `gates.ts` (four-gate evaluator incl. authority tier limits), `escalation.ts` (score), `contradiction.ts`, `fingerprint.ts`, `circuit-breaker.ts`, `passport.ts`, `policy.ts` (deterministic policy evaluation). `_shared/llm.ts` — structured JSON calls to Enter AI chat (protocol per selected model) with strict parsing + deterministic fallbacks. `_shared/db.ts` — service-role client; `_shared/cors.ts`.

Functions (all CORS + `Deno.serve`, zod input validation, no raw SQL, role checks):
1. **`resolveai-chat`** — main lifecycle (see Architecture). Streams `case_events` with short delays so the console animates. Creates/updates the Case Twin, runs actions with gates + breaker + verification, escalates when required, writes audit + analytics events, returns final snapshot + customer response.
2. **`resolveai-actions`** — deterministic gated action endpoints (`refund`, `update-ticket`, `send-message`) for the Payments/Refunds page; same engine as the lifecycle. `refund` runs the full validate→evidence→policy→authority→risk→record→update→audit→verify sequence.
3. **`resolveai-escalate`** — computes score/reasons, creates escalation, generates Resolution Passport, updates case state, notifies.
4. **`resolveai-analytics`** — real SQL aggregations: operational KPIs (open/resolved/avg resolution time/SLA compliance/escalation rate/automation success rate/verification failure rate/avg effort), complaint analytics (top intents, recurring + emerging fingerprints, root causes), customer analytics (repeat contacts, negative sentiment, churn risk, high-value customers with open cases).
5. **`resolveai-incidents`** — recompute fingerprint matches → upsert incidents + link affected cases; return incident list.
6. **`resolveai-bootstrap`** — idempotent: create demo auth users via Admin API (customer@ / tier1@ / tier2@ / manager@ / admin@, demo password), map into `resolveai_staff`/customers. Called once after deploy.
7. **`resolveai-selfcheck`** — integration harness that runs scenarios A/B/C against seeded customers and returns pass/fail assertions (shown in the UI on a Demo Self-Check page).

Frontend reads (queue, customers, orders, payments, cases detail) go directly through `supabase-js` + RLS. `client.ts`/`types.ts` remain auto-generated and untouched; env-provided values are imported from `src/integrations/supabase/client`.

## Frontend

- **Auth**: `/login` with demo-account quick-fill; `AuthProvider` (user+session stored, listener registered before session check), role context from `resolveai_staff`. RBAC gates nav + actions; role checks enforced server-side too.
- **Shell**: enterprise layout — dark sidebar (nav: Customer Chat, Complaint Queue, Live Investigations, Customers, Orders & Shipments, Payments & Refunds, Policy Engine, Incident Detection, Operational Analytics, Escalations, Audit Trail), topbar with role, realtime status, SLA clock.
- **Pages**: `/login`, `/chat` (customer chat: profile/tier/current case/previous interactions/chat history; real backend processing per message), `/queue` (filterable by priority/intent/sentiment/status/agent/escalated/SLA risk), `/investigations/:caseId` (Glass Box Console: case header + SLA countdown, AI Understanding panel, streaming Investigation Pipeline with per-step status/result/evidence count/duration/errors, gates, hypotheses, evidence, policy + RAG sources with scores, action + verification panels, audit timeline, Resolution Passport), `/customers` + `/customers/:id` (Customer 360), `/orders`, `/payments`, `/policies`, `/incidents` (→ affected cases), `/analytics` (recharts from server aggregations), `/escalations` (→ full passport), `/audit`, `/selfcheck`.
- **Reusable components** (per spec §38): CaseCard, CaseTable, StatusBadge, PriorityBadge, IntentBadge, SentimentIndicator, InvestigationTimeline, EvidencePanel, HypothesisPanel, PolicyPanel, GateStatus, ActionPanel, VerificationPanel, EscalationPanel, ResolutionPassport, Customer360, AnalyticsCards, IncidentPanel, AuditTimeline, ChatWindow.
- **Design system**: extend `src/index.css` + `tailwind.config.ts` with semantic tokens (brand indigo/navy, success/warning/danger/info, contrast-checked status recipes, focus ring); no hard-coded color classes; dark/light mode correct; responsive. Currency/date/SLA helpers in `src/lib/format.ts`. Types mirrored in `src/lib/types.ts`; typed API wrappers in `src/lib/api.ts`; realtime hook `useCaseEvents(caseId)` via Postgres changes.

## Demo tracks (must work end-to-end on seeded data)

- **Track A — Autonomous resolution**: Priya Sharma (gold) sends "I was charged twice for my order…" → duplicate payments (2× ₹2,499, same order) detected → billing agent → policy POL-REF-01 → gates pass (₹2,499 ≤ tier limit) → refund issued (real row + payment REFUNDED) → verified (status/refund_id/amount/timestamp) → customer notified → case RESOLVED → audit + analytics updated.
- **Track B — Contradiction**: Rahul Verma sends "courier says delivered but I never received my package" → order DB Delivered + courier Delivered + GPS location mismatch → CONTRADICTION DETECTED → auto-resolution BLOCKED → escalation + Resolution Passport → visible to human agent.
- **Track C — Circuit breaker**: Ananya Iyer's payment has `refund_api_sim_fail=true` → refund attempt fails → retry → fail → retry → fail → breaker tripped → automation paused → escalation with full context → audit.

## Implementation checklist

- [ ] Enable Enter Cloud (`supabase_enable`) and then AI capability (`enable_ai_capability`); load `enter_cloud` + LLM protocol reference for DeepSeek V4 Flash before writing backend code.
- [ ] Create `supabase/migrations/` schema: all `resolveai_*` tables, FKs, indexes (incl. GIN on chunks), validation triggers, RLS policies, realtime publication.
- [ ] Seed migration: customers/orders/items/payments/refunds/tickets/products/knowledge docs+chunks/policies/agents/cases/escalations/fingerprints/incidents (≥ the §31 counts, ₹ amounts, dense FKs, 3 track-specific setups).
- [ ] `_shared/engine/` pure-TS modules: classify, router, gates, escalation, contradiction, fingerprint, circuit-breaker, passport, policy.
- [ ] `_shared/llm.ts`: structured understanding/hypothesis/response calls with parse + deterministic fallback.
- [ ] Deploy `resolveai-chat` (full lifecycle, streaming case_events, Case Twin updates, audit + analytics writes, circuit breaker + verification + escalation paths).
- [ ] Deploy `resolveai-actions`, `resolveai-escalate`, `resolveai-analytics`, `resolveai-incidents`, `resolveai-bootstrap`, `resolveai-selfcheck`.
- [ ] Design tokens in `index.css`/`tailwind.config.ts`; enterprise shell (sidebar/topbar); auth flow + login page + role guard.
- [ ] Customer Chat page wired to `resolveai-chat` (real per-message processing, not canned replies).
- [ ] Complaint Queue page (CaseTable + filters + SLA risk + escalation state).
- [ ] Glass Box Console page (case header, understanding, live InvestigationTimeline via realtime, Evidence/Hypothesis/Policy/Gate/Action/Verification panels, RAG sources with scores, audit timeline, passport).
- [ ] Customers (360), Orders & Shipments, Payments & Refunds (gated actions), Policy Engine, Incidents, Escalations, Audit, Analytics (server-computed), Demo Self-Check pages.
- [ ] Reusable components per §38 + loading/empty/error/success states throughout.
- [ ] Unit tests (Vitest) for intent classifier fallback, router, gates incl. authority ₹ limits, contradiction detection, escalation score, circuit breaker trip, fingerprint matching.
- [ ] README rewrite (architecture, setup, env vars, demo credentials, demo scenarios, API list, AI/RAG/agent/security model); `.env.example` updated.
- [ ] Run `pnpm check` (lint + tsc) and `pnpm build`; fix errors.

## Verification checklist

- [ ] Track A end-to-end in preview: send "I was charged twice for my order." → console streams investigation → duplicate detected → gates PASS → refund executed → verification PASS → customer notified → case RESOLVED; verify in DB (refund row, payment REFUNDED, audit + analytics events).
- [ ] Track B end-to-end: courier-delivered message → contradiction shown → AUTO-RESOLUTION BLOCKED → escalation + passport visible on Escalations page.
- [ ] Track C end-to-end: refund attempts fail 3× → breaker tripped → AUTOMATION PAUSED → escalated with full context.
- [ ] Real-time: case_events animate step-by-step in the console (not a single final render).
- [ ] RAG: policy/knowledge decisions show document/section/score/reason; no invented policy.
- [ ] Negative/default paths: LLM failure falls back to rules (case still processes); missing customer/order/payment produce meaningful states; low-confidence cases are not auto-resolved; manual gate violation blocks an action.
- [ ] RBAC: staff roles restricted per route/action; customer sees only own data (RLS).
- [ ] `pnpm run selfcheck` harness passes scenarios A/B/C assertions; Vitest suite green.
- [ ] `pnpm check` and `pnpm build` pass with zero errors.
