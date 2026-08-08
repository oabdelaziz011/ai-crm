-- Sprint 3.12.2 — AI Lead Intelligence pipeline persistence
-- Extends Smart Capture (3.12.1). No parallel CRM.

-- ---------------------------------------------------------------------------
-- lead_ai_insights: immutable analysis snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.lead_ai_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  overall_confidence numeric not null default 0,
  processing_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_ai_insights_company_lead_created
  on public.lead_ai_insights (company_id, lead_id, created_at desc);

create index if not exists idx_lead_ai_insights_conversation
  on public.lead_ai_insights (company_id, conversation_id, created_at desc);

alter table public.lead_ai_insights enable row level security;

drop policy if exists lead_ai_insights_tenant on public.lead_ai_insights;
create policy lead_ai_insights_tenant on public.lead_ai_insights
  for all
  using (public.company_has_permission(company_id, 'leads.view'));

comment on table public.lead_ai_insights is
  'AI Lead Intelligence analysis snapshots (Sprint 3.12.2).';

-- ---------------------------------------------------------------------------
-- lead_ai_memory: mergeable facts per lead
-- ---------------------------------------------------------------------------
create table if not exists public.lead_ai_memory (
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  fact_key text not null,
  fact_value text not null default '',
  confidence numeric not null default 0,
  source text not null default '',
  updated_at timestamptz not null default now(),
  primary key (company_id, lead_id, fact_key)
);

create index if not exists idx_lead_ai_memory_lead
  on public.lead_ai_memory (company_id, lead_id);

alter table public.lead_ai_memory enable row level security;

drop policy if exists lead_ai_memory_tenant on public.lead_ai_memory;
create policy lead_ai_memory_tenant on public.lead_ai_memory
  for all
  using (public.company_has_permission(company_id, 'leads.view'));

comment on table public.lead_ai_memory is
  'AI Lead Intelligence memory facts (Sprint 3.12.2). Merged by fact_key.';

-- ---------------------------------------------------------------------------
-- lead_ai_suggestions: low-confidence CRM field proposals
-- ---------------------------------------------------------------------------
create table if not exists public.lead_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  field_key text not null,
  proposed_value jsonb not null default '{}'::jsonb,
  current_value jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'edited')),
  reviewer_user_id uuid null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists idx_lead_ai_suggestions_company_lead_status
  on public.lead_ai_suggestions (company_id, lead_id, status, created_at desc);

create index if not exists idx_lead_ai_suggestions_pending
  on public.lead_ai_suggestions (company_id, status)
  where status = 'pending';

alter table public.lead_ai_suggestions enable row level security;

drop policy if exists lead_ai_suggestions_tenant on public.lead_ai_suggestions;
create policy lead_ai_suggestions_tenant on public.lead_ai_suggestions
  for all
  using (public.company_has_permission(company_id, 'leads.view'));

comment on table public.lead_ai_suggestions is
  'AI Lead Intelligence CRM field suggestions below write threshold (Sprint 3.12.2).';

-- ---------------------------------------------------------------------------
-- Extend lead_ai_audit_log (nullable for 3.12.1 backward compat)
-- ---------------------------------------------------------------------------
alter table public.lead_ai_audit_log
  add column if not exists provider text null,
  add column if not exists model text null,
  add column if not exists version text null,
  add column if not exists latency_ms integer null,
  add column if not exists input_preview text null,
  add column if not exists output_preview text null;

create index if not exists idx_lead_ai_audit_provider
  on public.lead_ai_audit_log (company_id, provider, created_at desc);
