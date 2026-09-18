# ResolveAI — Autonomous Customer Support & Resolution Platform

ResolveAI is a full-stack autonomous customer-support platform. It is **not** a chatbot:
every customer message is routed through a real investigation pipeline that gathers
evidence from the customer, order, payment and ticket databases, retrieves company
policy and knowledge, forms root-cause hypotheses, evaluates a deterministic
**Four-Gate Controller** (Evidence · Policy · Authority · Risk), and only then either
executes a verified autonomous action or escalates the case to a human with a complete
**Resolution Passport**.

```
Customer
  → Intent + Context           (LLM understanding + deterministic fusion)
  → Ticket Router              (Billing / Order / Technical / Account specialists)
  → Multi-Source Investigation (customers · orders · payments · tickets · knowledge · policy)
  → Root-Cause Analysis        (deterministic duplicate/contradiction checks + LLM hypotheses)
  → Four-Gate Controller       (deterministic)
  → Autonomous Action          (gated tool → circuit breaker → independent verification)
  → Resolve  OR  Escalate      (Resolution Passport → human queue)
  → Audit · Analytics · Incident detection
```

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS (design tokens), shadcn/ui, TanStack Query, Recharts, lucide-react |
| Backend | **Enter Cloud** backend functions (Deno/TypeScript) — a single `resolveai` function exposing `chat`, `actions`, `escalate`, `analytics`, `incidents`, `bootstrap`, `selfcheck` routes |
| Database | Managed PostgreSQL (Enter Cloud). 20+ relational tables with foreign keys, RLS, and realtime publication |
| Real-time | Enter Cloud Realtime (WebSocket Postgres changes) streams investigation events into the Glass Box Console |
| AI | Enter AI gateway · **DeepSeek V4 Flash** (OpenAI Chat Completions protocol). LLM *proposes* understanding / hypotheses / reply text. The deterministic backend *controls* all execution. Every LLM call has a deterministic fallback. |
| RAG | PostgreSQL full-text retrieval (`websearch_to_tsquery` + `ts_rank_cd`) over seeded knowledge chunks with source scores shown in the console. Policy decisions always read real policy rows — the LLM never invents policy. |

> The platform cannot run Python/FastAPI or Docker containers, so the original spec
> was adapted: the FastAPI endpoint map maps 1:1 to backend-function routes, and the
> managed Enter Cloud PostgreSQL replaces local Postgres. No `.env` secret is ever
> exposed to the browser; the LLM token and service keys live in the backend
> environment.

## Features

- **Customer Chat** — customer context sidebar (profile, tier, previous interactions,
  open cases) + real backend processing of every message.
- **Complaint Queue** — filterable case table (intent, priority, sentiment, status,
  escalated, SLA risk, search).
- **Live Investigations / Glass Box Console** — real-time investigation pipeline with
  per-step status, evidence count, duration, findings; evidence/hypothesis/policy/gate/
  verification panels; RAG sources with retrieval scores; contradiction & circuit-breaker
  alerts; audit timeline.
- **Case Twin** — persistent case object updated as the investigation progresses
  (context, evidence, hypotheses, root cause, gates, actions, verification, passport).
- **Intelligent Ticket Router + Multi-Agent architecture** — supervisor orchestrator and
  Billing / Order / Technical / Account specialist agents with structured plans.
- **Four-Gate Controller** — deterministic Evidence / Policy / Authority / Risk gates
  (`Tier-1 ≤ ₹1,000`, `Tier-2 ≤ ₹5,000`, `Manager > ₹5,000`).
- **Autonomous Action Engine** — `issue_refund`, `update_ticket`, `send_message` mutate
  real state and are independently verified.
- **Circuit Breaker** — automation pauses after 3 consecutive action failures.
- **Contradiction Detection** — delivery/GPS contradictions block auto-resolution.
- **Escalation + Resolution Passport** — score, reasons, recommended queue, full context.
- **Incident Detection** — failure fingerprints crossing a threshold create incidents.
- **Operational Analytics** — server-computed KPIs from live database records.
- **Audit Trail** — every important operation is logged.
- **Auth & RBAC** — email/password with seeded Customer / Tier-1 / Tier-2 / Manager /
  Admin accounts; RLS on every table; role checks in backend functions.

## Demo login credentials

All accounts use password `ResolveAI@123`. If a demo account is missing, the login
page auto-provisions it once via the `bootstrap` route.

| Role | Email |
|------|-------|
| Customer | `customer@resolveai.demo` |
| Tier-1 Support Agent | `tier1@resolveai.demo` |
| Tier-2 Support Agent | `tier2@resolveai.demo` |
| Manager | `manager@resolveai.demo` |
| Administrator | `admin@resolveai.demo` |

## Running the application

The app is fully hosted on Enter Cloud — the database, backend functions, auth and
frontend are already deployed. Open the live preview and sign in.

Local development:

```bash
pnpm install        # install dependencies
pnpm run dev        # start the Vite dev server (frontend talks to the deployed backend)
pnpm run check      # eslint + tsc
pnpm run test       # Vitest unit tests for the deterministic engine
pnpm run build      # production build
```

Rebuild & redeploy the backend function after editing `supabase/functions/resolveai/`:

```bash
node scripts/bundle-resolveai.mjs   # inline shared modules into index.ts
# then deploy the "resolveai" function through the platform
```

## Environment variables

Client secrets are never stored in the frontend. Backend secrets (database URL,
service key, LLM API token `AI_API_TOKEN_*`, project attribution header) are managed
by Enter Cloud and read with `Deno.env.get(...)` inside backend functions. `.env.example`
holds only publishable analytics configuration used by `src/analytics.ts`.

## Database

All tables use the stable `resolveai_` prefix and live under `supabase/migrations/`:

- `resolveai_staff`, `resolveai_customers`
- `resolveai_conversations`, `resolveai_messages`
- `resolveai_cases` (the Case Twin) + `resolveai_case_events` (realtime)
- `resolveai_products`, `resolveai_orders`, `resolveai_order_items`
- `resolveai_payments`, `resolveai_refunds`, `resolveai_tickets`
- `resolveai_knowledge_documents`, `resolveai_knowledge_chunks` (tsvector GIN index)
- `resolveai_policies`, `resolveai_agents`
- `resolveai_agent_actions`, `resolveai_action_verifications`
- `resolveai_escalations`, `resolveai_failure_fingerprints`
- `resolveai_incidents`, `resolveai_incident_cases`
- `resolveai_analytics_events`, `resolveai_audit_logs`

RLS is enabled on every table (staff full access; customers read their own data).
`resolveai_case_events`, `resolveai_cases`, `resolveai_escalations` and
`resolveai_messages` are published to realtime.

Seed data (migration `0002_seed.sql`): 20 customers, 50 orders, 60 payments,
23 tickets, 40 cases, 10 products, 10 knowledge documents (chunked), 10 policies,
4 agents, 8 refunds, 5 failure fingerprints, 2 incidents, 3 escalations.

## API (backend function routes)

The single deployed backend function is invoked as
`POST /functions/v1/resolveai` (or via `supabase.functions.invoke("resolveai", …))`
with a `route` field:

| Route | Method | Description |
|-------|--------|-------------|
| `chat` | POST | `{ customer_id?, message, fast?, skipLlm? }` → runs the full lifecycle, returns case + reply |
| `actions` | POST | staff-only gated action tools: `issue_refund`, `update_ticket`, `send_message` |
| `escalate` | POST | staff-only manual escalation with Resolution Passport |
| `analytics` | POST/GET | server-computed KPIs from live DB records |
| `incidents` | POST/GET | incidents + failure fingerprints + linked cases |
| `bootstrap` | POST | idempotent demo-account provisioning |
| `selfcheck` | POST | integration harness for the three demo tracks (A/B/C assertions) |

## AI / RAG / multi-agent architecture

- **Safety:** the LLM returns structured JSON proposals (intent, hypotheses, reply).
  Sensitive actions execute only through deterministic, gated tools after the
  Four-Gate Controller passes. Failed or unverified actions are never reported as
  successful to the customer.
- **RAG:** customer message → full-text retrieval over `resolveai_knowledge_chunks`
  (scores via `ts_rank_cd`) → sources attached to the case → reply generation grounded
  in retrieved policy/knowledge. The Glass Box Console shows document, section, score.
- **Agents:** the supervisor builds the investigation plan, routes to a specialist,
  and fuses structured evidence. Each specialist returns structured output
  (`resolveai_agents.plan_steps` / `allowed_tools`).

## Security model

- RLS on all tables; staff rows gate client reads.
- Backend functions resolve the caller from the JWT (`resolveai_staff`/customers) and
  enforce role checks server-side — never on the client.
- Authority limits enforced deterministically by the Authority gate.
- Audit logging on routing, actions, gates, escalations and verification.
- No secrets in the frontend; no raw SQL inside backend functions (client query API + RPC only).

## Demo scenarios

Open **Demo Self-Check** (`/selfcheck`, Manager or Admin) and press **Run integration test**,
or drive them live from the **Customer Chat** page:

1. **Duplicate payment (autonomous resolution)** — as customer, send
   *"I was charged twice for my order. The order is still pending and I already contacted support twice."*
   Watch: intent detection → Billing Agent → duplicate detected → policy POL-REF-01 →
   gates PASS → refund ₹2,499 issued → verification PASS → case RESOLVED.
2. **Contradiction** — as customer, send
   *"The courier says delivered but I never received my package."*
   Watch: courier + GPS evidence → **CONTRADICTION DETECTED** → auto-resolution blocked →
   escalated with a Resolution Passport (visible under **Escalations**).
3. **Circuit breaker** — as customer, send
   *"My refund is not coming through. I was charged and the refund keeps failing."*
   Watch: refund attempt fails → retry → fails → retry → fails → **AUTOMATION PAUSED** →
   escalated with full context.

## Remaining limitations

- RAG uses PostgreSQL full-text retrieval (deterministic, scored) instead of vector
  embeddings — no embedding endpoint is exposed by the platform's AI gateway.
- The refund "API failure" in scenario C is a seeded deterministic simulation flag
  (`resolveai_payments.refund_api_sim_fail`) standing in for an external gateway outage.
- The backend is a single deployed function with routed endpoints (a platform
  deployment constraint) rather than one function per endpoint.
