-- Sprint 6.11B: Enterprise Lead Platform — production schema, RBAC, metrics RPC.

insert into public.permissions (code, category, module, action, description)
values
  ('leads.view', 'Leads', 'Leads', 'View', 'View leads and pipeline'),
  ('leads.create', 'Leads', 'Leads', 'Create', 'Create leads'),
  ('leads.edit', 'Leads', 'Leads', 'Edit', 'Update lead fields'),
  ('leads.assign', 'Leads', 'Leads', 'Assign', 'Assign leads to agents'),
  ('leads.qualify', 'Leads', 'Leads', 'Qualify', 'Qualify or disqualify leads'),
  ('leads.convert', 'Leads', 'Leads', 'Convert', 'Convert leads to customers'),
  ('leads.merge', 'Leads', 'Leads', 'Merge', 'Merge duplicate leads'),
  ('leads.archive', 'Leads', 'Leads', 'Archive', 'Archive or restore leads'),
  ('leads.manage', 'Leads', 'Leads', 'Manage', 'Manage pipelines, stages, and lead platform settings')
on conflict (code) do update
set category = excluded.category, module = excluded.module, action = excluded.action,
    description = excluded.description, updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'leads.view'), ('admin', 'leads.create'), ('admin', 'leads.edit'),
    ('admin', 'leads.assign'), ('admin', 'leads.qualify'), ('admin', 'leads.convert'),
    ('admin', 'leads.merge'), ('admin', 'leads.archive'), ('admin', 'leads.manage'),
    ('manager', 'leads.view'), ('manager', 'leads.create'), ('manager', 'leads.edit'),
    ('manager', 'leads.assign'), ('manager', 'leads.qualify'), ('manager', 'leads.convert'),
    ('manager', 'leads.merge'), ('manager', 'leads.archive'),
    ('employee', 'leads.view'), ('employee', 'leads.create'), ('employee', 'leads.edit'),
    ('employee', 'leads.assign'), ('employee', 'leads.qualify'), ('employee', 'leads.convert')
) as v(template_key, permission_code)
on conflict do nothing;

-- Pipelines
create table if not exists public.lead_pipelines (
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

create index if not exists idx_lead_pipelines_company_active
  on public.lead_pipelines(company_id, is_active) where deleted_at is null;

-- Stages
create table if not exists public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null references public.lead_pipelines(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  slug text not null,
  lifecycle_status text not null default 'new'
    check (lifecycle_status in (
      'new', 'qualified', 'contacted', 'demo_scheduled', 'proposal_sent',
      'negotiation', 'won', 'lost', 'converted', 'archived'
    )),
  sort_order int not null default 0,
  probability_percent int not null default 0 check (probability_percent >= 0 and probability_percent <= 100),
  is_terminal boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (pipeline_id, slug)
);

create index if not exists idx_lead_stages_pipeline_order
  on public.lead_stages(pipeline_id, sort_order) where deleted_at is null;

-- Sources
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  slug text not null,
  channel_type text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, slug)
);

create index if not exists idx_lead_sources_company
  on public.lead_sources(company_id) where deleted_at is null;

-- Leads
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pipeline_id uuid not null references public.lead_pipelines(id) on delete restrict,
  stage_id uuid not null references public.lead_stages(id) on delete restrict,
  source_id uuid references public.lead_sources(id) on delete set null,
  lifecycle_status text not null default 'new'
    check (lifecycle_status in (
      'new', 'qualified', 'contacted', 'demo_scheduled', 'proposal_sent',
      'negotiation', 'won', 'lost', 'converted', 'archived'
    )),
  title text not null check (char_length(trim(title)) > 0),
  contact_name text not null default '',
  email text,
  phone text,
  company_name text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  estimated_value numeric(14, 2),
  currency text not null default 'USD',
  score int not null default 0 check (score >= 0 and score <= 100),
  is_qualified boolean not null default false,
  is_vip boolean not null default false,
  language text,
  territory text,
  department text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  qualified_at timestamptz,
  converted_at timestamptz,
  archived_at timestamptz,
  ai_summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_leads_company_stage
  on public.leads(company_id, stage_id) where deleted_at is null;

create index if not exists idx_leads_company_assigned
  on public.leads(company_id, assigned_user_id) where deleted_at is null;

create index if not exists idx_leads_company_status
  on public.leads(company_id, lifecycle_status) where deleted_at is null;

create index if not exists idx_leads_company_email
  on public.leads(company_id, lower(email)) where deleted_at is null and email is not null;

create index if not exists idx_leads_company_phone
  on public.leads(company_id, phone) where deleted_at is null and phone is not null;

-- Assignments
create table if not exists public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_user_id uuid not null references auth.users(id) on delete cascade,
  assignment_method text not null default 'manual'
    check (assignment_method in (
      'manual', 'round_robin', 'least_busy', 'territory', 'department', 'language', 'vip'
    )),
  assigned_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_assignments_lead_active
  on public.lead_assignments(lead_id, is_active) where is_active = true;

-- Scores
create table if not exists public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  score int not null check (score >= 0 and score <= 100),
  reason text not null default '',
  scored_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_scores_lead
  on public.lead_scores(lead_id, created_at desc);

-- Tags
create table if not exists public.lead_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tag text not null check (char_length(trim(tag)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (lead_id, tag)
);

create index if not exists idx_lead_tags_company_tag
  on public.lead_tags(company_id, tag) where deleted_at is null;

-- Notes
create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  is_internal boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_lead_notes_lead
  on public.lead_notes(lead_id, created_at desc) where deleted_at is null;

-- Activities
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  activity_type text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_activities_lead
  on public.lead_activities(lead_id, created_at desc);

-- History (field changes)
create table if not exists public.lead_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  field_name text not null,
  previous_value text,
  new_value text,
  change_action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_history_lead
  on public.lead_history(lead_id, created_at desc);

-- Conversion history
create table if not exists public.lead_conversion_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  opportunity_id uuid,
  converted_by uuid references auth.users(id) on delete set null,
  preserved_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_conversion_history_lead
  on public.lead_conversion_history(lead_id, created_at desc);

-- Custom fields
create table if not exists public.lead_custom_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_key text not null,
  field_label text not null,
  field_type text not null default 'text'
    check (field_type in ('text', 'number', 'boolean', 'date', 'select')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, field_key)
);

-- Import batches
create table if not exists public.lead_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_name text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  total_rows int not null default 0,
  imported_rows int not null default 0,
  skipped_rows int not null default 0,
  error_rows int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_lead_import_batches_company
  on public.lead_import_batches(company_id, created_at desc);

-- RLS
alter table public.lead_pipelines enable row level security;
alter table public.lead_stages enable row level security;
alter table public.lead_sources enable row level security;
alter table public.leads enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.lead_scores enable row level security;
alter table public.lead_tags enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_activities enable row level security;
alter table public.lead_history enable row level security;
alter table public.lead_conversion_history enable row level security;
alter table public.lead_custom_fields enable row level security;
alter table public.lead_import_batches enable row level security;

create policy lead_pipelines_tenant on public.lead_pipelines
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_stages_tenant on public.lead_stages
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_sources_tenant on public.lead_sources
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy leads_tenant on public.leads
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_assignments_tenant on public.lead_assignments
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_scores_tenant on public.lead_scores
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_tags_tenant on public.lead_tags
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_notes_tenant on public.lead_notes
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_activities_tenant on public.lead_activities
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_history_tenant on public.lead_history
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_conversion_history_tenant on public.lead_conversion_history
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_custom_fields_tenant on public.lead_custom_fields
  for all using (public.company_has_permission(company_id, 'leads.view'));

create policy lead_import_batches_tenant on public.lead_import_batches
  for all using (public.company_has_permission(company_id, 'leads.view'));

alter publication supabase_realtime add table public.leads;

-- Metrics RPC
create or replace function public.lead_platform_company_metrics_v1(
  p_company_id uuid,
  p_period_start timestamptz default (now() - interval '30 days')
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with stage_counts as (
    select coalesce(jsonb_object_agg(lifecycle_status, cnt), '{}'::jsonb) as data
    from (
      select lifecycle_status, count(*)::int as cnt
      from public.leads
      where company_id = p_company_id and deleted_at is null
      group by lifecycle_status
    ) s
  ),
  pipeline_counts as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pipelineId', p.id,
          'pipelineName', p.name,
          'leadCount', coalesce(lc.cnt, 0),
          'pipelineValue', coalesce(lc.val, 0)
        )
        order by p.name
      ),
      '[]'::jsonb
    ) as data
    from public.lead_pipelines p
    left join lateral (
      select count(*)::int as cnt, coalesce(sum(l.estimated_value), 0)::numeric as val
      from public.leads l
      where l.company_id = p_company_id and l.pipeline_id = p.id and l.deleted_at is null
        and l.lifecycle_status not in ('lost', 'archived', 'converted')
    ) lc on true
    where p.company_id = p_company_id and p.deleted_at is null and p.is_active = true
  ),
  conversions as (
    select count(*)::int as total
    from public.lead_conversion_history c
    where c.company_id = p_company_id and c.created_at >= p_period_start
  ),
  created as (
    select count(*)::int as total
    from public.leads l
    where l.company_id = p_company_id and l.created_at >= p_period_start and l.deleted_at is null
  ),
  forecast as (
    select coalesce(sum(l.estimated_value * (s.probability_percent::numeric / 100)), 0)::numeric as weighted_value
    from public.leads l
    join public.lead_stages s on s.id = l.stage_id
    where l.company_id = p_company_id and l.deleted_at is null
      and l.lifecycle_status not in ('lost', 'archived', 'converted')
  )
  select jsonb_build_object(
    'totalLeads', (select count(*)::int from public.leads where company_id = p_company_id and deleted_at is null),
    'leadsByStatus', (select data from stage_counts),
    'pipelineMetrics', (select data from pipeline_counts),
    'conversionsInPeriod', (select total from conversions),
    'createdInPeriod', (select total from created),
    'forecastValue', (select weighted_value from forecast),
    'conversionRate',
      case when (select total from created) > 0
        then round((select total from conversions)::numeric / (select total from created), 4)
        else 0 end
  );
$$;

-- Seed default pipeline function (called from app on first lead create if missing)
create or replace function public.lead_platform_ensure_default_pipeline(p_company_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pipeline_id uuid;
  v_stage_id uuid;
begin
  select id into v_pipeline_id
  from public.lead_pipelines
  where company_id = p_company_id and is_default = true and deleted_at is null
  limit 1;

  if v_pipeline_id is not null then
    return v_pipeline_id;
  end if;

  insert into public.lead_pipelines (company_id, name, slug, is_default, is_active)
  values (p_company_id, 'Default Pipeline', 'default', true, true)
  returning id into v_pipeline_id;

  insert into public.lead_stages (company_id, pipeline_id, name, slug, lifecycle_status, sort_order, probability_percent)
  values
    (p_company_id, v_pipeline_id, 'New', 'new', 'new', 0, 5),
    (p_company_id, v_pipeline_id, 'Qualified', 'qualified', 'qualified', 1, 20),
    (p_company_id, v_pipeline_id, 'Contacted', 'contacted', 'contacted', 2, 30),
    (p_company_id, v_pipeline_id, 'Demo Scheduled', 'demo_scheduled', 'demo_scheduled', 3, 45),
    (p_company_id, v_pipeline_id, 'Proposal Sent', 'proposal_sent', 'proposal_sent', 4, 60),
    (p_company_id, v_pipeline_id, 'Negotiation', 'negotiation', 'negotiation', 5, 75),
    (p_company_id, v_pipeline_id, 'Won', 'won', 'won', 6, 100),
    (p_company_id, v_pipeline_id, 'Lost', 'lost', 'lost', 7, 0),
    (p_company_id, v_pipeline_id, 'Converted', 'converted', 'converted', 8, 100);

  return v_pipeline_id;
end;
$$;
