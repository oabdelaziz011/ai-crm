-- Sprint 4.0: Sales Execution Platform — Opportunity foundation (domain, RBAC, pipeline).
-- References Lead / Customer; does not duplicate conversations or AI engines.

insert into public.permissions (code, category, module, action, description)
values
  ('opportunities.view', 'Opportunities', 'Opportunities', 'View', 'View opportunities and pipeline'),
  ('opportunities.create', 'Opportunities', 'Opportunities', 'Create', 'Create opportunities'),
  ('opportunities.edit', 'Opportunities', 'Opportunities', 'Edit', 'Update opportunity fields'),
  ('opportunities.delete', 'Opportunities', 'Opportunities', 'Delete', 'Archive or delete opportunities'),
  ('opportunities.convert', 'Opportunities', 'Opportunities', 'Convert', 'Create opportunities from qualified leads')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'opportunities.view'), ('admin', 'opportunities.create'), ('admin', 'opportunities.edit'),
    ('admin', 'opportunities.delete'), ('admin', 'opportunities.convert'),
    ('manager', 'opportunities.view'), ('manager', 'opportunities.create'), ('manager', 'opportunities.edit'),
    ('manager', 'opportunities.delete'), ('manager', 'opportunities.convert'),
    ('employee', 'opportunities.view'), ('employee', 'opportunities.create'), ('employee', 'opportunities.edit'),
    ('employee', 'opportunities.convert')
) as v(template_key, permission_code)
on conflict do nothing;

create table if not exists public.opportunity_pipelines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  slug text not null,
  description text not null default '',
  is_default boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, slug)
);

create index if not exists idx_opportunity_pipelines_company_active
  on public.opportunity_pipelines(company_id, is_active) where deleted_at is null;

create table if not exists public.opportunity_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null references public.opportunity_pipelines(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  slug text not null,
  stage_key text not null
    check (stage_key in (
      'qualification', 'discovery', 'proposal', 'negotiation', 'contract', 'won', 'lost'
    )),
  sort_order int not null default 0,
  default_probability_percent int not null default 0
    check (default_probability_percent >= 0 and default_probability_percent <= 100),
  is_terminal boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (pipeline_id, slug)
);

create index if not exists idx_opportunity_stages_pipeline_order
  on public.opportunity_stages(pipeline_id, sort_order) where deleted_at is null;

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null references public.opportunity_pipelines(id) on delete restrict,
  stage_id uuid not null references public.opportunity_stages(id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  -- Canonical references — do not duplicate Lead / Customer CRM data
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  primary_contact_name text not null default '',
  owner_user_id uuid references auth.users(id) on delete set null,
  company_name text,
  country text,
  market text,
  language text,
  currency text not null default 'USD',
  expected_revenue numeric(14, 2),
  weighted_revenue numeric(14, 2),
  exchange_rate numeric(18, 8), -- placeholder for FX
  regional_pricing jsonb not null default '{}'::jsonb, -- placeholder
  probability_percent int not null default 0
    check (probability_percent >= 0 and probability_percent <= 100),
  probability_confidence numeric(5, 4),
  probability_source text not null default 'manual',
  probability_reason text not null default '',
  expected_close_date date,
  created_from_lead boolean not null default false,
  ai_score_snapshot numeric(8, 2),
  ai_context_snapshot jsonb not null default '{}'::jsonb,
  -- Read-only carry-over of lead intelligence at creation (not a second AI engine)
  metadata jsonb not null default '{}'::jsonb,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_opportunities_company_stage
  on public.opportunities(company_id, stage_id) where deleted_at is null;

create index if not exists idx_opportunities_company_owner
  on public.opportunities(company_id, owner_user_id) where deleted_at is null;

create index if not exists idx_opportunities_lead
  on public.opportunities(lead_id) where deleted_at is null and lead_id is not null;

create index if not exists idx_opportunities_customer
  on public.opportunities(customer_id) where deleted_at is null and customer_id is not null;

create table if not exists public.opportunity_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  event_type text not null,
  field_name text,
  previous_value text,
  new_value text,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_opportunity_history_opp
  on public.opportunity_history(opportunity_id, created_at desc);

alter table public.opportunity_pipelines enable row level security;
alter table public.opportunity_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_history enable row level security;

create policy opportunity_pipelines_tenant on public.opportunity_pipelines
  for all using (public.company_has_permission(company_id, 'opportunities.view'));

create policy opportunity_stages_tenant on public.opportunity_stages
  for all using (public.company_has_permission(company_id, 'opportunities.view'));

create policy opportunities_tenant on public.opportunities
  for all using (public.company_has_permission(company_id, 'opportunities.view'));

create policy opportunity_history_tenant on public.opportunity_history
  for all using (public.company_has_permission(company_id, 'opportunities.view'));

-- FK from conversion history when opportunity exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_conversion_history_opportunity_id_fkey'
  ) then
    alter table public.lead_conversion_history
      add constraint lead_conversion_history_opportunity_id_fkey
      foreign key (opportunity_id) references public.opportunities(id) on delete set null;
  end if;
exception
  when others then
    -- Keep conversion history writable even if existing orphaned UUIDs block FK.
    null;
end $$;

create or replace function public.opportunity_platform_ensure_default_pipeline(p_company_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pipeline_id uuid;
begin
  select id into v_pipeline_id
  from public.opportunity_pipelines
  where company_id = p_company_id and is_default = true and deleted_at is null
  limit 1;

  if v_pipeline_id is not null then
    return v_pipeline_id;
  end if;

  insert into public.opportunity_pipelines (company_id, name, slug, is_default, is_active, description)
  values (p_company_id, 'Sales Execution', 'sales-execution', true, true, 'Default opportunity pipeline')
  returning id into v_pipeline_id;

  insert into public.opportunity_stages (
    company_id, pipeline_id, name, slug, stage_key, sort_order, default_probability_percent, is_terminal
  ) values
    (p_company_id, v_pipeline_id, 'Qualification', 'qualification', 'qualification', 0, 10, false),
    (p_company_id, v_pipeline_id, 'Discovery', 'discovery', 'discovery', 1, 25, false),
    (p_company_id, v_pipeline_id, 'Proposal', 'proposal', 'proposal', 2, 45, false),
    (p_company_id, v_pipeline_id, 'Negotiation', 'negotiation', 'negotiation', 3, 65, false),
    (p_company_id, v_pipeline_id, 'Contract', 'contract', 'contract', 4, 85, false),
    (p_company_id, v_pipeline_id, 'Won', 'won', 'won', 5, 100, true),
    (p_company_id, v_pipeline_id, 'Lost', 'lost', 'lost', 6, 0, true);

  return v_pipeline_id;
end;
$$;
