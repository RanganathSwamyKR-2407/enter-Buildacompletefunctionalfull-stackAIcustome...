-- =====================================================================
-- ResolveAI — schema migration
-- Enterprise autonomous customer-support platform (new business module)
-- All tables use the stable `resolveai_` prefix.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER to avoid recursive RLS on staff/customers)
-- Created after resolveai_staff / resolveai_customers exist.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Staff & customers
-- ---------------------------------------------------------------------
create table public.resolveai_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('customer_support_t1','customer_support_t2','manager','admin')),
  created_at timestamptz not null default now()
);

create table public.resolveai_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  customer_code text not null unique,
  name text not null,
  email text not null,
  phone text,
  city text,
  tier text not null default 'standard' check (tier in ('standard','premium','gold')),
  lifetime_value numeric(12,2) not null default 0,
  orders_count int not null default 0,
  refunds_count int not null default 0,
  churn_risk int not null default 0,
  sentiment_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER to avoid recursive RLS on staff/customers)
-- ---------------------------------------------------------------------
create or replace function public.resolveai_current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.resolveai_staff where user_id = auth.uid();
$$;

create or replace function public.resolveai_current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.resolveai_customers where user_id = auth.uid();
$$;

create or replace function public.resolveai_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create table public.resolveai_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.resolveai_customers(id) on delete cascade,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now()
);

create table public.resolveai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.resolveai_conversations(id) on delete cascade,
  role text not null check (role in ('customer','ai','agent','system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index resolveai_messages_conversation_idx on public.resolveai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- Case Twin
-- ---------------------------------------------------------------------
create table public.resolveai_cases (
  id uuid primary key default gen_random_uuid(),
  case_id text not null unique,
  customer_id uuid not null references public.resolveai_customers(id) on delete cascade,
  conversation_id uuid references public.resolveai_conversations(id) on delete set null,
  message_text text,
  intent text,
  sub_intents jsonb not null default '[]'::jsonb,
  urgency text,
  sentiment text,
  sentiment_score numeric(5,2),
  priority text,
  status text not null default 'new' check (status in ('new','investigating','action_required','action_failed','verifying','resolved','escalated','closed','automation_paused')),
  specialist text,
  routing_reason text,
  routing_confidence numeric(5,2),
  sla_deadline timestamptz,
  customer_history jsonb not null default '{}'::jsonb,
  order_ids jsonb not null default '[]'::jsonb,
  transaction_ids jsonb not null default '[]'::jsonb,
  ticket_ids jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  evidence_count int not null default 0,
  hypotheses jsonb not null default '[]'::jsonb,
  root_cause text,
  root_cause_confidence numeric(5,2),
  recommended_action jsonb not null default '{}'::jsonb,
  gates jsonb not null default '{}'::jsonb,
  policy_result jsonb not null default '{}'::jsonb,
  authority_result jsonb not null default '{}'::jsonb,
  risk_result jsonb not null default '{}'::jsonb,
  contradiction_detected boolean not null default false,
  contradictions jsonb not null default '[]'::jsonb,
  verification_result jsonb not null default '{}'::jsonb,
  escalation_score numeric(5,2),
  escalation_reasons jsonb not null default '[]'::jsonb,
  circuit_breaker jsonb not null default '{}'::jsonb,
  action_history jsonb not null default '[]'::jsonb,
  agent_notes text,
  assigned_agent text,
  resolution_status text,
  resolution_passport jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index resolveai_cases_customer_idx on public.resolveai_cases (customer_id);
create index resolveai_cases_status_idx on public.resolveai_cases (status);
create index resolveai_cases_intent_idx on public.resolveai_cases (intent);
create index resolveai_cases_priority_idx on public.resolveai_cases (priority);
create index resolveai_cases_created_idx on public.resolveai_cases (created_at desc);
create trigger resolveai_cases_touch before update on public.resolveai_cases
  for each row execute function public.resolveai_touch_updated_at();

-- Real-time investigation events (drives the Glass Box Console)
create table public.resolveai_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.resolveai_cases(id) on delete cascade,
  stage text not null,
  label text not null,
  status text not null check (status in ('running','ok','warn','error')),
  result jsonb not null default '{}'::jsonb,
  evidence_count int not null default 0,
  duration_ms int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index resolveai_case_events_case_idx on public.resolveai_case_events (case_id, created_at);

-- ---------------------------------------------------------------------
-- Commerce: products / orders / payments / refunds / tickets
-- ---------------------------------------------------------------------
create table public.resolveai_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text not null,
  price numeric(12,2) not null,
  description text
);

create table public.resolveai_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  customer_id uuid not null references public.resolveai_customers(id) on delete cascade,
  status text not null check (status in ('pending','paid','processing','shipped','delivered','returned','cancelled','failed')),
  amount numeric(12,2) not null,
  item_count int not null default 1,
  shipment_status text check (shipment_status in ('not_shipped','in_transit','out_for_delivery','delivered','returning','failed_delivery')),
  courier text,
  tracking_number text,
  gps_evidence jsonb not null default '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index resolveai_orders_customer_idx on public.resolveai_orders (customer_id);

create table public.resolveai_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.resolveai_orders(id) on delete cascade,
  product_id uuid not null references public.resolveai_products(id),
  quantity int not null default 1,
  unit_price numeric(12,2) not null
);
create index resolveai_order_items_order_idx on public.resolveai_order_items (order_id);

create table public.resolveai_payments (
  id uuid primary key default gen_random_uuid(),
  txn_id text not null unique,
  customer_id uuid not null references public.resolveai_customers(id) on delete cascade,
  order_id uuid not null references public.resolveai_orders(id) on delete cascade,
  amount numeric(12,2) not null,
  status text not null check (status in ('pending','succeeded','refunded','failed')),
  method text not null default 'UPI',
  gateway text not null default 'razorpay',
  refund_api_sim_fail boolean not null default false,
  created_at timestamptz not null default now()
);
create index resolveai_payments_order_idx on public.resolveai_payments (order_id);
create index resolveai_payments_customer_idx on public.resolveai_payments (customer_id);
create index resolveai_payments_status_idx on public.resolveai_payments (status);

create table public.resolveai_refunds (
  id uuid primary key default gen_random_uuid(),
  refund_id text not null unique,
  case_id uuid references public.resolveai_cases(id) on delete set null,
  payment_id uuid not null references public.resolveai_payments(id) on delete cascade,
  customer_id uuid not null references public.resolveai_customers(id) on delete cascade,
  amount numeric(12,2) not null,
  status text not null check (status in ('issued','failed','processing')),
  issued_at timestamptz,
  verification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index resolveai_refunds_payment_idx on public.resolveai_refunds (payment_id);
create index resolveai_refunds_case_idx on public.resolveai_refunds (case_id);

create table public.resolveai_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  customer_id uuid not null references public.resolveai_customers(id) on delete cascade,
  subject text not null,
  category text not null,
  status text not null default 'closed',
  resolution text,
  created_at timestamptz not null default now()
);
create index resolveai_tickets_customer_idx on public.resolveai_tickets (customer_id);

-- ---------------------------------------------------------------------
-- Knowledge & policies (RAG)
-- ---------------------------------------------------------------------
create table public.resolveai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  doc_id text not null unique,
  title text not null,
  category text not null check (category in ('policy','product','faq','procedure','incident')),
  content text not null,
  source text
);

create table public.resolveai_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.resolveai_knowledge_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  content_search tsvector not null,
  token_count int not null default 0
);
create index resolveai_knowledge_chunks_search_idx on public.resolveai_knowledge_chunks using gin (content_search);
create index resolveai_knowledge_chunks_doc_idx on public.resolveai_knowledge_chunks (document_id, chunk_index);

create table public.resolveai_policies (
  id uuid primary key default gen_random_uuid(),
  policy_id text not null unique,
  name text not null,
  category text not null,
  description text not null,
  conditions jsonb not null default '{}'::jsonb,
  allowed_actions jsonb not null default '[]'::jsonb,
  restrictions jsonb not null default '[]'::jsonb,
  authority_limits jsonb not null default '{}'::jsonb,
  effective_from date not null default current_date
);

-- ---------------------------------------------------------------------
-- Agents & actions
-- ---------------------------------------------------------------------
create table public.resolveai_agents (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null unique,
  name text not null,
  description text not null,
  specialties jsonb not null default '[]'::jsonb,
  plan_steps jsonb not null default '[]'::jsonb,
  allowed_tools jsonb not null default '[]'::jsonb
);

create table public.resolveai_agent_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.resolveai_cases(id) on delete cascade,
  agent_key text not null,
  action text not null,
  status text not null check (status in ('proposed','executing','succeeded','failed','blocked')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index resolveai_agent_actions_case_idx on public.resolveai_agent_actions (case_id, created_at);

create table public.resolveai_action_verifications (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.resolveai_agent_actions(id) on delete cascade,
  case_id uuid not null references public.resolveai_cases(id) on delete cascade,
  checks jsonb not null default '[]'::jsonb,
  overall text not null check (overall in ('passed','failed','unknown')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Escalations, fingerprints, incidents
-- ---------------------------------------------------------------------
create table public.resolveai_escalations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.resolveai_cases(id) on delete cascade,
  score numeric(5,2) not null,
  reasons jsonb not null default '[]'::jsonb,
  recommended_queue text not null,
  priority text not null,
  passport jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','assigned','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index resolveai_escalations_case_idx on public.resolveai_escalations (case_id);
create index resolveai_escalations_status_idx on public.resolveai_escalations (status);

create table public.resolveai_failure_fingerprints (
  id uuid primary key default gen_random_uuid(),
  fingerprint_id text not null unique,
  name text not null,
  symptoms jsonb not null default '[]'::jsonb,
  affected_system text not null,
  probable_root_cause text not null,
  frequency int not null default 0,
  severity text not null check (severity in ('low','medium','high','critical')),
  recommended_recovery text
);

create table public.resolveai_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_id text not null unique,
  fingerprint_id uuid not null references public.resolveai_failure_fingerprints(id),
  name text not null,
  status text not null default 'active' check (status in ('active','investigating','mitigated')),
  affected_case_count int not null default 0,
  first_detected_at timestamptz not null default now(),
  severity text not null,
  recommended_response text,
  updated_at timestamptz not null default now()
);

create table public.resolveai_incident_cases (
  incident_id uuid not null references public.resolveai_incidents(id) on delete cascade,
  case_id uuid not null references public.resolveai_cases(id) on delete cascade,
  primary key (incident_id, case_id)
);

-- ---------------------------------------------------------------------
-- Analytics & audit
-- ---------------------------------------------------------------------
create table public.resolveai_analytics_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.resolveai_customers(id) on delete set null,
  case_id uuid references public.resolveai_cases(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index resolveai_analytics_events_type_idx on public.resolveai_analytics_events (event_type, created_at);

create table public.resolveai_audit_logs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.resolveai_cases(id) on delete cascade,
  actor text not null,
  agent text,
  action text not null,
  input jsonb not null default '{}'::jsonb,
  decision jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  policy jsonb not null default '{}'::jsonb,
  authority jsonb not null default '{}'::jsonb,
  risk jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  verification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index resolveai_audit_logs_case_idx on public.resolveai_audit_logs (case_id, created_at);
create index resolveai_audit_logs_created_idx on public.resolveai_audit_logs (created_at desc);

-- =====================================================================
-- Row Level Security
-- Staff get full access; customers can read their own rows.
-- All writes in the app go through backend functions (service role).
-- =====================================================================
alter table public.resolveai_staff enable row level security;
create policy resolveai_staff_select_own on public.resolveai_staff
  for select using (auth.uid() = user_id);
create policy resolveai_staff_all_staff on public.resolveai_staff
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_customers enable row level security;
create policy resolveai_customers_select_staff on public.resolveai_customers
  for select using (public.resolveai_current_staff_role() is not null);
create policy resolveai_customers_select_own on public.resolveai_customers
  for select using (public.resolveai_current_customer_id() = id);
create policy resolveai_customers_write_staff on public.resolveai_customers
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_conversations enable row level security;
create policy resolveai_conversations_select_staff on public.resolveai_conversations
  for select using (public.resolveai_current_staff_role() is not null);
create policy resolveai_conversations_select_own on public.resolveai_conversations
  for select using (public.resolveai_current_customer_id() = customer_id);
create policy resolveai_conversations_write_staff on public.resolveai_conversations
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_messages enable row level security;
create policy resolveai_messages_select_staff on public.resolveai_messages
  for select using (public.resolveai_current_staff_role() is not null);
create policy resolveai_messages_select_own on public.resolveai_messages
  for select using (
    exists (
      select 1 from public.resolveai_conversations c
      where c.id = conversation_id and public.resolveai_current_customer_id() = c.customer_id
    )
  );
create policy resolveai_messages_write_staff on public.resolveai_messages
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_cases enable row level security;
create policy resolveai_cases_select_staff on public.resolveai_cases
  for select using (public.resolveai_current_staff_role() is not null);
create policy resolveai_cases_select_own on public.resolveai_cases
  for select using (public.resolveai_current_customer_id() = customer_id);
create policy resolveai_cases_write_staff on public.resolveai_cases
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_case_events enable row level security;
create policy resolveai_case_events_select_staff on public.resolveai_case_events
  for select using (public.resolveai_current_staff_role() is not null);
create policy resolveai_case_events_select_own on public.resolveai_case_events
  for select using (
    exists (
      select 1 from public.resolveai_cases c
      where c.id = resolveai_case_events.case_id and public.resolveai_current_customer_id() = c.customer_id
    )
  );

-- Operational tables: staff only
alter table public.resolveai_products enable row level security;
create policy resolveai_products_staff on public.resolveai_products
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_orders enable row level security;
create policy resolveai_orders_staff on public.resolveai_orders
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_order_items enable row level security;
create policy resolveai_order_items_staff on public.resolveai_order_items
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_payments enable row level security;
create policy resolveai_payments_staff on public.resolveai_payments
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_refunds enable row level security;
create policy resolveai_refunds_staff on public.resolveai_refunds
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_tickets enable row level security;
create policy resolveai_tickets_staff on public.resolveai_tickets
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_knowledge_documents enable row level security;
create policy resolveai_knowledge_documents_staff on public.resolveai_knowledge_documents
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_knowledge_chunks enable row level security;
create policy resolveai_knowledge_chunks_staff on public.resolveai_knowledge_chunks
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_policies enable row level security;
create policy resolveai_policies_staff on public.resolveai_policies
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_agents enable row level security;
create policy resolveai_agents_staff on public.resolveai_agents
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_agent_actions enable row level security;
create policy resolveai_agent_actions_staff on public.resolveai_agent_actions
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_action_verifications enable row level security;
create policy resolveai_action_verifications_staff on public.resolveai_action_verifications
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_escalations enable row level security;
create policy resolveai_escalations_staff on public.resolveai_escalations
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_failure_fingerprints enable row level security;
create policy resolveai_failure_fingerprints_staff on public.resolveai_failure_fingerprints
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_incidents enable row level security;
create policy resolveai_incidents_staff on public.resolveai_incidents
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_incident_cases enable row level security;
create policy resolveai_incident_cases_staff on public.resolveai_incident_cases
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_analytics_events enable row level security;
create policy resolveai_analytics_events_staff on public.resolveai_analytics_events
  for all using (public.resolveai_current_staff_role() is not null);

alter table public.resolveai_audit_logs enable row level security;
create policy resolveai_audit_logs_staff on public.resolveai_audit_logs
  for all using (public.resolveai_current_staff_role() is not null);

-- =====================================================================
-- Realtime publication (live investigation console + chat)
-- =====================================================================
alter publication supabase_realtime add table public.resolveai_case_events;
alter publication supabase_realtime add table public.resolveai_cases;
alter publication supabase_realtime add table public.resolveai_escalations;
alter publication supabase_realtime add table public.resolveai_messages;
