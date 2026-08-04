-- Production schema repair: idempotent reconstruction of repo migrations 214-225 and 227.
-- Skips 226 (omnichannel realtime already deployed on production under version 214).

-- =============================================================================
-- 214 — AI Employee Ticket Management
-- =============================================================================

insert into public.permissions (code, category, module, action, description)
values
  ('tickets.view', 'Tickets', 'Tickets', 'View', 'View support tickets'),
  ('tickets.create', 'Tickets', 'Tickets', 'Create', 'Create support tickets'),
  ('tickets.edit', 'Tickets', 'Tickets', 'Edit', 'Update support ticket fields'),
  ('tickets.assign', 'Tickets', 'Tickets', 'Assign', 'Assign support tickets to agents'),
  ('tickets.comment', 'Tickets', 'Tickets', 'Comment', 'Add comments to support tickets'),
  ('tickets.close', 'Tickets', 'Tickets', 'Close', 'Close or resolve support tickets'),
  ('tickets.manage', 'Tickets', 'Tickets', 'Manage', 'Manage support ticket platform settings')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'tickets.view'),
    ('admin', 'tickets.create'),
    ('admin', 'tickets.edit'),
    ('admin', 'tickets.assign'),
    ('admin', 'tickets.comment'),
    ('admin', 'tickets.close'),
    ('admin', 'tickets.manage')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in (
    'tickets.view',
    'tickets.create',
    'tickets.edit',
    'tickets.assign',
    'tickets.comment',
    'tickets.close',
    'tickets.manage'
  )
where r.company_id is not null
  and r.is_system = true
  and (
    r.template_key = 'admin'
    or r.name ilike '%admin%'
    or r.description ilike '%administrator%'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

create sequence if not exists public.support_ticket_number_seq;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_number text not null,
  subject text not null check (char_length(trim(subject)) > 0),
  description text not null default '',
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  customer_id uuid references public.customers(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, ticket_number)
);

create index if not exists idx_support_tickets_company_status
  on public.support_tickets(company_id, status)
  where deleted_at is null;

create index if not exists idx_support_tickets_company_priority
  on public.support_tickets(company_id, priority)
  where deleted_at is null;

create index if not exists idx_support_tickets_company_assigned
  on public.support_tickets(company_id, assigned_user_id)
  where deleted_at is null and assigned_user_id is not null;

create index if not exists idx_support_tickets_company_customer
  on public.support_tickets(company_id, customer_id)
  where deleted_at is null and customer_id is not null;

create table if not exists public.support_ticket_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  is_internal boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_comments_ticket
  on public.support_ticket_comments(ticket_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'support_tickets'
      and t.tgname = 'support_tickets_updated_at'
      and not t.tgisinternal
  ) then
    create trigger support_tickets_updated_at
      before update on public.support_tickets
      for each row execute procedure public.set_updated_at();
  end if;
end $$;

create or replace function public.generate_support_ticket_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
begin
  v_seq := nextval('public.support_ticket_number_seq');
  return 'TKT-' || lpad(v_seq::text, 6, '0');
end;
$$;

create or replace function public.write_support_ticket_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id text;
  v_company_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;
  v_company_id := coalesce(new.company_id, old.company_id);

  if TG_TABLE_NAME = 'support_tickets' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'ticketNumber', new.ticket_number,
        'subject', new.subject,
        'status', new.status,
        'priority', new.priority
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'ticketNumber', new.ticket_number,
        'old', jsonb_build_object('status', old.status, 'priority', old.priority, 'assignedUserId', old.assigned_user_id),
        'new', jsonb_build_object('status', new.status, 'priority', new.priority, 'assignedUserId', new.assigned_user_id)
      );
    else
      v_metadata := jsonb_build_object('ticketNumber', old.ticket_number, 'subject', old.subject);
    end if;
  elsif TG_TABLE_NAME = 'support_ticket_comments' then
    v_company_id := coalesce(new.company_id, old.company_id);
    v_entity_id := coalesce(new.ticket_id, old.ticket_id)::text;
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('isInternal', new.is_internal, 'bodyPreview', left(new.body, 120));
    else
      v_metadata := jsonb_build_object('isInternal', coalesce(new.is_internal, old.is_internal));
    end if;
  end if;

  insert into public.audit_logs (user_id, company_id, action, entity, entity_id, metadata)
  values (auth.uid(), v_company_id, v_action, TG_TABLE_NAME, v_entity_id, v_metadata);

  return coalesce(new, old);
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'support_tickets'
      and t.tgname = 'support_tickets_audit'
      and not t.tgisinternal
  ) then
    create trigger support_tickets_audit
      after insert or update or delete on public.support_tickets
      for each row execute procedure public.write_support_ticket_audit_log();
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'support_ticket_comments'
      and t.tgname = 'support_ticket_comments_audit'
      and not t.tgisinternal
  ) then
    create trigger support_ticket_comments_audit
      after insert or update or delete on public.support_ticket_comments
      for each row execute procedure public.write_support_ticket_audit_log();
  end if;
end $$;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_comments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_tickets' and policyname = 'support_tickets_select') then
    create policy support_tickets_select on public.support_tickets for select using (
      deleted_at is null and public.company_has_permission(company_id, 'tickets.view')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_tickets' and policyname = 'support_tickets_insert') then
    create policy support_tickets_insert on public.support_tickets for insert with check (
      public.company_has_permission(company_id, 'tickets.create')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_tickets' and policyname = 'support_tickets_update') then
    create policy support_tickets_update on public.support_tickets for update using (
      deleted_at is null and public.company_has_permission(company_id, 'tickets.edit')
    ) with check (
      public.company_has_permission(company_id, 'tickets.edit')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_tickets' and policyname = 'support_tickets_delete') then
    create policy support_tickets_delete on public.support_tickets for delete using (
      public.company_has_permission(company_id, 'tickets.manage')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_ticket_comments' and policyname = 'support_ticket_comments_select') then
    create policy support_ticket_comments_select on public.support_ticket_comments for select using (
      public.company_has_permission(company_id, 'tickets.view')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_ticket_comments' and policyname = 'support_ticket_comments_insert') then
    create policy support_ticket_comments_insert on public.support_ticket_comments for insert with check (
      public.company_has_permission(company_id, 'tickets.comment')
    );
  end if;
end $$;

insert into public.tool_definitions (
  key, display_name, description, category, version, is_enabled,
  required_permissions, supported_states, input_schema, output_schema, timeout_ms, retry_policy
)
values
  (
    'create_ticket', 'Create Ticket',
    'Create a new support ticket with subject, description, priority, and optional customer or conversation link.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.create"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"subject":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"customerId":{"type":"string"},"conversationId":{"type":"string"}},"required":["subject"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"ticketNumber":{"type":"string"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'update_ticket', 'Update Ticket',
    'Update mutable fields on an existing support ticket such as subject or description.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"subject":{"type":"string"},"description":{"type":"string"}},"required":["ticketId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'close_ticket', 'Close Ticket',
    'Close or resolve a support ticket with optional resolution note.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.close"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"resolutionNote":{"type":"string"},"status":{"type":"string"}},"required":["ticketId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"status":{"type":"string"}}}'::jsonb,
    30000, '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'assign_ticket', 'Assign Ticket',
    'Assign a support ticket to an agent by user id or display name.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.assign"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"assigneeUserId":{"type":"string"},"assigneeName":{"type":"string"}},"required":["ticketId"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"assignedUserId":{"type":"string"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'add_ticket_comment', 'Add Ticket Comment',
    'Add a public or internal comment to a support ticket.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.comment"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"body":{"type":"string"},"isInternal":{"type":"boolean"}},"required":["ticketId","body"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"commentId":{"type":"string"}}}'::jsonb,
    20000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  ),
  (
    'change_ticket_priority', 'Change Ticket Priority',
    'Change the priority of a support ticket (low, normal, high, urgent).',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"priority":{"type":"string"}},"required":["ticketId","priority"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"priority":{"type":"string"}}}'::jsonb,
    20000, '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'change_ticket_status', 'Change Ticket Status',
    'Change the workflow status of a support ticket.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.edit"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"ticketId":{"type":"string"},"status":{"type":"string"}},"required":["ticketId","status"]}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"ticketId":{"type":"string"},"status":{"type":"string"}}}'::jsonb,
    20000, '{"maxAttempts":1,"backoffMs":0}'::jsonb
  ),
  (
    'search_ticket', 'Search Tickets',
    'Search support tickets by query, status, priority, assignee, or customer.',
    'support', '1.0.0', true,
    '["tools.execute", "tickets.view"]'::jsonb,
    '["idle","greeting","collecting_information","waiting_user","waiting_api","transferred_to_human"]'::jsonb,
    '{"type":"object","properties":{"query":{"type":"string"},"status":{"type":"string"},"priority":{"type":"string"},"assigneeName":{"type":"string"},"customerId":{"type":"string"},"limit":{"type":"number"}}}'::jsonb,
    '{"type":"object","properties":{"success":{"type":"boolean"},"total":{"type":"number"},"tickets":{"type":"array"}}}'::jsonb,
    30000, '{"maxAttempts":2,"backoffMs":500}'::jsonb
  )
on conflict (key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  category = excluded.category,
  version = excluded.version,
  is_enabled = excluded.is_enabled,
  required_permissions = excluded.required_permissions,
  supported_states = excluded.supported_states,
  input_schema = excluded.input_schema,
  output_schema = excluded.output_schema,
  timeout_ms = excluded.timeout_ms,
  retry_policy = excluded.retry_policy,
  updated_at = now();

-- =============================================================================
-- 215 — Ticket Platform Foundation (SLA columns; no data backfill)
-- =============================================================================

alter table public.support_tickets
  add column if not exists sla_due_at timestamptz,
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by uuid references auth.users(id) on delete set null;

create index if not exists idx_support_tickets_company_conversation
  on public.support_tickets(company_id, conversation_id)
  where deleted_at is null;

create index if not exists idx_support_tickets_company_sla_due
  on public.support_tickets(company_id, sla_due_at)
  where deleted_at is null and status in ('open', 'in_progress', 'waiting_customer');

-- =============================================================================
-- 216 — Ticket Platform Metrics
-- =============================================================================

create or replace function public.ticket_platform_company_metrics_v1(
  p_company_id uuid,
  p_today_start timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      id, status, priority, assigned_user_id, created_at, closed_at,
      resolved_at, first_response_at, sla_due_at
    from public.support_tickets
    where company_id = p_company_id and deleted_at is null
  ),
  priority_counts as (
    select coalesce(jsonb_object_agg(priority, cnt), '{}'::jsonb) as data
    from (select priority, count(*)::int as cnt from base group by priority) s
  ),
  status_counts as (
    select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) as data
    from (select status, count(*)::int as cnt from base group by status) s
  ),
  agent_counts as (
    select coalesce(
      jsonb_agg(jsonb_build_object('agentId', agent_id, 'agentName', agent_name, 'count', cnt) order by cnt desc),
      '[]'::jsonb
    ) as data
    from (
      select
        b.assigned_user_id as agent_id,
        coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), b.assigned_user_id::text) as agent_name,
        count(*)::int as cnt
      from base b
      left join public.profiles p on p.id = b.assigned_user_id
      where b.assigned_user_id is not null
      group by b.assigned_user_id, p.full_name, p.email
    ) s
  ),
  aggregates as (
    select
      count(*) filter (where status in ('open', 'in_progress', 'waiting_customer'))::int as open_tickets,
      count(*) filter (where closed_at is not null and closed_at >= p_today_start)::int as closed_today,
      coalesce(round(avg(extract(epoch from (coalesce(resolved_at, closed_at) - created_at)) / 60.0)
        filter (where coalesce(resolved_at, closed_at) is not null))::int, 0) as average_resolution_minutes,
      coalesce(round(avg(extract(epoch from (first_response_at - created_at)) / 60.0)
        filter (where first_response_at is not null))::int, 0) as average_response_minutes,
      count(*) filter (where status in ('resolved', 'closed') and sla_due_at is not null
        and coalesce(resolved_at, closed_at) > sla_due_at)::int as sla_breaches_closed,
      count(*) filter (where status in ('open', 'in_progress', 'waiting_customer')
        and sla_due_at is not null and sla_due_at < now())::int as sla_breaches_open,
      count(*) filter (where status in ('resolved', 'closed'))::int as total_closed_for_sla
    from base
  )
  select jsonb_build_object(
    'openTickets', a.open_tickets,
    'closedToday', a.closed_today,
    'averageResolutionMinutes', a.average_resolution_minutes,
    'averageResponseMinutes', a.average_response_minutes,
    'slaBreaches', a.sla_breaches_closed + a.sla_breaches_open,
    'slaBreachesOpen', a.sla_breaches_open,
    'slaBreachesClosed', a.sla_breaches_closed,
    'slaCompliancePercent',
      case when a.total_closed_for_sla = 0 then 100
        else round(((a.total_closed_for_sla - a.sla_breaches_closed)::numeric / a.total_closed_for_sla) * 1000) / 10 end,
    'ticketsByPriority', pc.data,
    'ticketsByStatus', sc.data,
    'ticketsByAgent', ac.data
  )
  from aggregates a
  cross join priority_counts pc
  cross join status_counts sc
  cross join agent_counts ac;
$$;

grant execute on function public.ticket_platform_company_metrics_v1(uuid, timestamptz) to authenticated, service_role;

-- =============================================================================
-- 217 — Human Handoff Platform
-- =============================================================================

insert into public.permissions (code, category, module, action, description)
values
  ('handoff.view', 'Handoff', 'Human Handoff', 'View', 'View handoff state, queues, and agent workspace context'),
  ('handoff.transfer', 'Handoff', 'Human Handoff', 'Transfer', 'Transfer conversations between agents, queues, and AI'),
  ('handoff.accept', 'Handoff', 'Human Handoff', 'Accept', 'Accept queued or transferred conversations'),
  ('handoff.reject', 'Handoff', 'Human Handoff', 'Reject', 'Reject handoff requests'),
  ('handoff.assign', 'Handoff', 'Human Handoff', 'Assign', 'Assign conversations to agents or queues'),
  ('handoff.queue', 'Handoff', 'Human Handoff', 'Queue', 'Enqueue and dequeue conversations'),
  ('handoff.escalate', 'Handoff', 'Human Handoff', 'Escalate', 'Escalate conversations to supervisors or specialized queues'),
  ('handoff.return_to_ai', 'Handoff', 'Human Handoff', 'Return to AI', 'Return conversations to AI handling'),
  ('handoff.presence', 'Handoff', 'Human Handoff', 'Presence', 'Update and view agent presence'),
  ('handoff.manage', 'Handoff', 'Human Handoff', 'Manage', 'Manage handoff queues, routing rules, and escalation policies')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select v.template_key, v.permission_code
from (
  values
    ('admin', 'handoff.view'),
    ('admin', 'handoff.transfer'),
    ('admin', 'handoff.accept'),
    ('admin', 'handoff.reject'),
    ('admin', 'handoff.assign'),
    ('admin', 'handoff.queue'),
    ('admin', 'handoff.escalate'),
    ('admin', 'handoff.return_to_ai'),
    ('admin', 'handoff.presence'),
    ('admin', 'handoff.manage'),
    ('manager', 'handoff.view'),
    ('manager', 'handoff.transfer'),
    ('manager', 'handoff.accept'),
    ('manager', 'handoff.reject'),
    ('manager', 'handoff.assign'),
    ('manager', 'handoff.queue'),
    ('manager', 'handoff.escalate'),
    ('manager', 'handoff.return_to_ai'),
    ('manager', 'handoff.presence'),
    ('employee', 'handoff.view'),
    ('employee', 'handoff.transfer'),
    ('employee', 'handoff.accept'),
    ('employee', 'handoff.reject'),
    ('employee', 'handoff.assign'),
    ('employee', 'handoff.queue'),
    ('employee', 'handoff.escalate'),
    ('employee', 'handoff.return_to_ai'),
    ('employee', 'handoff.presence')
) as v(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = v.template_key
    and existing.permission_code = v.permission_code
);

create table if not exists public.handoff_queues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  slug text not null,
  description text not null default '',
  routing_strategy text not null default 'round_robin'
    check (routing_strategy in (
      'round_robin', 'least_busy', 'skills_based', 'department_based',
      'priority_based', 'vip_routing', 'language_routing'
    )),
  department_id uuid,
  max_queue_size int not null default 500 check (max_queue_size > 0),
  overflow_queue_id uuid references public.handoff_queues(id) on delete set null,
  business_hours jsonb not null default '{}'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  priority_weight int not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (company_id, slug)
);

create index if not exists idx_handoff_queues_company_active
  on public.handoff_queues(company_id, is_active)
  where deleted_at is null;

create table if not exists public.handoff_queue_members (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.handoff_queues(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  skills jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  last_assigned_at timestamptz,
  active_conversation_count int not null default 0 check (active_conversation_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (queue_id, user_id)
);

create index if not exists idx_handoff_queue_members_company_user
  on public.handoff_queue_members(company_id, user_id)
  where is_active = true;

create table if not exists public.handoff_conversation_ownership (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_type text not null
    check (owner_type in ('ai_employee', 'human_agent', 'queue', 'system')),
  owner_id uuid,
  owner_label text not null default '',
  queue_id uuid references public.handoff_queues(id) on delete set null,
  lifecycle_state text not null default 'AI_HANDLING',
  assigned_user_id uuid references auth.users(id) on delete set null,
  ai_assistant_id uuid,
  is_paused boolean not null default false,
  paused_at timestamptz,
  paused_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id)
);

create index if not exists idx_handoff_ownership_company_owner
  on public.handoff_conversation_ownership(company_id, owner_type, owner_id);

create index if not exists idx_handoff_ownership_company_queue
  on public.handoff_conversation_ownership(company_id, queue_id)
  where queue_id is not null;

create index if not exists idx_handoff_ownership_company_assigned
  on public.handoff_conversation_ownership(company_id, assigned_user_id)
  where assigned_user_id is not null;

create table if not exists public.handoff_ownership_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  previous_owner_type text,
  previous_owner_id uuid,
  new_owner_type text not null,
  new_owner_id uuid,
  transition_action text not null,
  transition_reason text not null default '',
  actor_user_id uuid references auth.users(id) on delete set null,
  context_snapshot_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_handoff_ownership_history_conversation
  on public.handoff_ownership_history(conversation_id, created_at desc);

create table if not exists public.handoff_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  request_type text not null
    check (request_type in ('transfer', 'escalation', 'queue', 'return_to_ai')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  from_owner_type text,
  from_owner_id uuid,
  to_owner_type text,
  to_owner_id uuid,
  to_queue_id uuid references public.handoff_queues(id) on delete set null,
  reason text not null default '',
  escalation_reason_code text,
  priority text not null default 'normal',
  context_snapshot_id uuid,
  requested_by_user_id uuid references auth.users(id) on delete set null,
  requested_by_ai_assistant_id uuid,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  rejected_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_handoff_requests_company_status
  on public.handoff_requests(company_id, status, created_at desc)
  where deleted_at is null;

create index if not exists idx_handoff_requests_conversation
  on public.handoff_requests(conversation_id, created_at desc)
  where deleted_at is null;

create table if not exists public.handoff_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  summary text not null default '',
  suggested_resolution text not null default '',
  suggested_reply text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_handoff_context_snapshots_conversation
  on public.handoff_context_snapshots(conversation_id, created_at desc);

create table if not exists public.agent_presence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'offline'
    check (state in ('online', 'busy', 'away', 'offline', 'break', 'dnd')),
  viewing_conversation_id uuid references public.conversations(id) on delete set null,
  last_heartbeat_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists idx_agent_presence_company_state
  on public.agent_presence(company_id, state);

create table if not exists public.handoff_escalation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  trigger_code text not null
    check (trigger_code in (
      'low_confidence', 'customer_requested', 'sensitive_topic', 'billing',
      'complaint', 'repeated_failures', 'policy_violation', 'manual'
    )),
  target_queue_id uuid references public.handoff_queues(id) on delete set null,
  target_level text not null default 'supervisor',
  priority_boost text not null default 'normal',
  conditions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_handoff_escalation_rules_company_active
  on public.handoff_escalation_rules(company_id, is_active)
  where deleted_at is null;

alter table public.handoff_queues enable row level security;
alter table public.handoff_queue_members enable row level security;
alter table public.handoff_conversation_ownership enable row level security;
alter table public.handoff_ownership_history enable row level security;
alter table public.handoff_requests enable row level security;
alter table public.handoff_context_snapshots enable row level security;
alter table public.agent_presence enable row level security;
alter table public.handoff_escalation_rules enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'handoff_queues' and policyname = 'handoff_queues_tenant') then
    create policy handoff_queues_tenant on public.handoff_queues
      for all using (public.company_has_permission(company_id, 'handoff.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'handoff_queue_members' and policyname = 'handoff_queue_members_tenant') then
    create policy handoff_queue_members_tenant on public.handoff_queue_members
      for all using (public.company_has_permission(company_id, 'handoff.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'handoff_conversation_ownership' and policyname = 'handoff_ownership_tenant') then
    create policy handoff_ownership_tenant on public.handoff_conversation_ownership
      for all using (public.company_has_permission(company_id, 'handoff.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'handoff_ownership_history' and policyname = 'handoff_ownership_history_tenant') then
    create policy handoff_ownership_history_tenant on public.handoff_ownership_history
      for all using (public.company_has_permission(company_id, 'handoff.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'handoff_requests' and policyname = 'handoff_requests_tenant') then
    create policy handoff_requests_tenant on public.handoff_requests
      for all using (public.company_has_permission(company_id, 'handoff.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'handoff_context_snapshots' and policyname = 'handoff_context_snapshots_tenant') then
    create policy handoff_context_snapshots_tenant on public.handoff_context_snapshots
      for all using (public.company_has_permission(company_id, 'handoff.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'agent_presence' and policyname = 'agent_presence_tenant') then
    create policy agent_presence_tenant on public.agent_presence
      for all using (public.company_has_permission(company_id, 'handoff.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'handoff_escalation_rules' and policyname = 'handoff_escalation_rules_tenant') then
    create policy handoff_escalation_rules_tenant on public.handoff_escalation_rules
      for all using (public.company_has_permission(company_id, 'handoff.view'));
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.handoff_conversation_ownership;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.handoff_requests;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.agent_presence;
exception when duplicate_object then null;
end $$;

create or replace function public.handoff_platform_company_metrics_v1(
  p_company_id uuid,
  p_period_start timestamptz default (now() - interval '30 days')
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with transfers as (
    select count(*)::int as total
    from public.handoff_ownership_history h
    where h.company_id = p_company_id
      and h.created_at >= p_period_start
      and h.transition_action in ('transfer', 'transfer_conversation', 'assign', 'reassign')
  ),
  escalations as (
    select
      coalesce(jsonb_object_agg(escalation_reason_code, cnt), '{}'::jsonb) as by_reason,
      coalesce(sum(cnt), 0)::int as total
    from (
      select coalesce(r.escalation_reason_code, 'unknown') as escalation_reason_code, count(*)::int as cnt
      from public.handoff_requests r
      where r.company_id = p_company_id
        and r.request_type = 'escalation'
        and r.created_at >= p_period_start
        and r.deleted_at is null
      group by coalesce(r.escalation_reason_code, 'unknown')
    ) s
  ),
  queue_stats as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'queueId', q.id,
          'queueName', q.name,
          'waitingCount', coalesce(waiting.cnt, 0),
          'assignedCount', coalesce(assigned.cnt, 0)
        )
        order by q.name
      ),
      '[]'::jsonb
    ) as data
    from public.handoff_queues q
    left join lateral (
      select count(*)::int as cnt
      from public.handoff_conversation_ownership o
      where o.company_id = p_company_id and o.queue_id = q.id and o.owner_type = 'queue'
    ) waiting on true
    left join lateral (
      select count(*)::int as cnt
      from public.handoff_conversation_ownership o
      where o.company_id = p_company_id and o.queue_id = q.id and o.owner_type = 'human_agent'
    ) assigned on true
    where q.company_id = p_company_id and q.deleted_at is null and q.is_active = true
  ),
  wait_times as (
    select
      coalesce(avg(extract(epoch from (accepted.created_at - pending.created_at))), 0)::float as avg_wait_seconds
    from public.handoff_requests pending
    join public.handoff_requests accepted
      on accepted.conversation_id = pending.conversation_id
     and accepted.status = 'accepted'
     and accepted.created_at >= pending.created_at
    where pending.company_id = p_company_id
      and pending.status = 'pending'
      and pending.created_at >= p_period_start
      and pending.deleted_at is null
  ),
  resolution as (
    select
      count(*) filter (where o.owner_type = 'ai_employee' and o.lifecycle_state in ('RESOLVED', 'CLOSED'))::int as ai_resolved,
      count(*) filter (where o.owner_type = 'human_agent' and o.lifecycle_state in ('RESOLVED', 'CLOSED'))::int as human_resolved,
      count(*)::int as total_owned
    from public.handoff_conversation_ownership o
    where o.company_id = p_company_id
  ),
  agent_util as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', ap.user_id,
          'state', ap.state,
          'activeConversations', coalesce(ac.cnt, 0)
        )
      ),
      '[]'::jsonb
    ) as data
    from public.agent_presence ap
    left join lateral (
      select count(*)::int as cnt
      from public.handoff_conversation_ownership o
      where o.company_id = p_company_id
        and o.assigned_user_id = ap.user_id
        and o.lifecycle_state not in ('CLOSED', 'RESOLVED')
    ) ac on true
    where ap.company_id = p_company_id
  )
  select jsonb_build_object(
    'transferCount', (select total from transfers),
    'escalationReasons', (select by_reason from escalations),
    'escalationCount', (select total from escalations),
    'averageWaitTimeSeconds', (select avg_wait_seconds from wait_times),
    'queuePerformance', (select data from queue_stats),
    'aiResolutionRate',
      case when (select total_owned from resolution) > 0
        then round((select ai_resolved from resolution)::numeric / (select total_owned from resolution), 4)
        else 0 end,
    'humanResolutionRate',
      case when (select total_owned from resolution) > 0
        then round((select human_resolved from resolution)::numeric / (select total_owned from resolution), 4)
        else 0 end,
    'agentUtilization', (select data from agent_util)
  );
$$;

-- =============================================================================
-- 218 — Lead Platform Foundation
-- =============================================================================

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
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = v.template_key
    and existing.permission_code = v.permission_code
);

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

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_pipelines' and policyname = 'lead_pipelines_tenant') then
    create policy lead_pipelines_tenant on public.lead_pipelines
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_stages' and policyname = 'lead_stages_tenant') then
    create policy lead_stages_tenant on public.lead_stages
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_sources' and policyname = 'lead_sources_tenant') then
    create policy lead_sources_tenant on public.lead_sources
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leads' and policyname = 'leads_tenant') then
    create policy leads_tenant on public.leads
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_assignments' and policyname = 'lead_assignments_tenant') then
    create policy lead_assignments_tenant on public.lead_assignments
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_scores' and policyname = 'lead_scores_tenant') then
    create policy lead_scores_tenant on public.lead_scores
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_tags' and policyname = 'lead_tags_tenant') then
    create policy lead_tags_tenant on public.lead_tags
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_notes' and policyname = 'lead_notes_tenant') then
    create policy lead_notes_tenant on public.lead_notes
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_activities' and policyname = 'lead_activities_tenant') then
    create policy lead_activities_tenant on public.lead_activities
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_history' and policyname = 'lead_history_tenant') then
    create policy lead_history_tenant on public.lead_history
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_conversion_history' and policyname = 'lead_conversion_history_tenant') then
    create policy lead_conversion_history_tenant on public.lead_conversion_history
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_custom_fields' and policyname = 'lead_custom_fields_tenant') then
    create policy lead_custom_fields_tenant on public.lead_custom_fields
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_import_batches' and policyname = 'lead_import_batches_tenant') then
    create policy lead_import_batches_tenant on public.lead_import_batches
      for all using (public.company_has_permission(company_id, 'leads.view'));
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null;
end $$;

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

create or replace function public.lead_platform_ensure_default_pipeline(p_company_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pipeline_id uuid;
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

-- =============================================================================
-- 219 — Business OS Identity Integration
-- =============================================================================

alter table public.conversations
  add column if not exists lead_id uuid references public.leads(id) on delete set null;

create index if not exists idx_conversations_company_lead
  on public.conversations(company_id, lead_id)
  where deleted_at is null and lead_id is not null;

create index if not exists idx_leads_conversation
  on public.leads(conversation_id)
  where deleted_at is null and conversation_id is not null;

create index if not exists idx_leads_customer
  on public.leads(company_id, customer_id)
  where deleted_at is null and customer_id is not null;

-- =============================================================================
-- 220 — Universal Entity Foundation
-- =============================================================================

create table if not exists public.entity_type_registry (
  code text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

insert into public.entity_type_registry (code, label) values
  ('customer', 'Customer'),
  ('lead', 'Lead'),
  ('company', 'Company'),
  ('employee', 'Employee'),
  ('supplier', 'Supplier'),
  ('project', 'Project'),
  ('asset', 'Asset'),
  ('booking', 'Booking'),
  ('invoice', 'Invoice'),
  ('ticket', 'Ticket'),
  ('knowledge', 'Knowledge')
on conflict (code) do nothing;

create table if not exists public.entity_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  contact_type text not null default 'primary'
    check (contact_type in ('primary', 'billing', 'technical', 'emergency', 'decision_maker', 'assistant', 'other')),
  display_name text not null,
  emails jsonb not null default '[]'::jsonb,
  phones jsonb not null default '[]'::jsonb,
  whatsapp text,
  preferred_language text,
  preferred_channel text,
  notes text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  is_primary boolean not null default false,
  search_text text generated always as (
    lower(coalesce(display_name, '') || ' ' || coalesce(whatsapp, '') || ' ' || coalesce(notes, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_entity_contacts_tenant_entity
  on public.entity_contacts(tenant_id, entity_type, entity_id)
  where deleted_at is null;

create index if not exists idx_entity_contacts_search
  on public.entity_contacts(tenant_id, search_text)
  where deleted_at is null;

create table if not exists public.entity_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  category text,
  storage_provider text not null default 'supabase',
  storage_path text not null,
  preview_metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  permissions jsonb not null default '{}'::jsonb,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_entity_files_tenant_entity
  on public.entity_files(tenant_id, entity_type, entity_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_entity_files_name
  on public.entity_files(tenant_id, lower(file_name))
  where deleted_at is null;

create table if not exists public.entity_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text,
  icon text,
  category text,
  description text,
  is_system boolean not null default false,
  search_text text generated always as (lower(coalesce(name, '') || ' ' || coalesce(description, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, name)
);

create index if not exists idx_entity_tags_tenant
  on public.entity_tags(tenant_id)
  where deleted_at is null;

create table if not exists public.entity_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  tag_id uuid not null references public.entity_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, entity_type, entity_id, tag_id)
);

create index if not exists idx_entity_tag_assignments_entity
  on public.entity_tag_assignments(tenant_id, entity_type, entity_id)
  where deleted_at is null;

create table if not exists public.entity_custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in (
    'text', 'textarea', 'number', 'currency', 'boolean', 'date', 'datetime',
    'dropdown', 'multi_select', 'lookup', 'formula', 'json'
  )),
  options jsonb not null default '{}'::jsonb,
  validation_rules jsonb not null default '{}'::jsonb,
  visibility_rules jsonb not null default '{}'::jsonb,
  required_rules jsonb not null default '{}'::jsonb,
  role_permissions jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, entity_type, field_key)
);

create index if not exists idx_entity_custom_fields_tenant_type
  on public.entity_custom_fields(tenant_id, entity_type, sort_order)
  where deleted_at is null;

create table if not exists public.entity_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  field_id uuid not null references public.entity_custom_fields(id) on delete cascade,
  value_text text,
  value_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (tenant_id, entity_type, entity_id, field_id)
);

create index if not exists idx_entity_custom_field_values_entity
  on public.entity_custom_field_values(tenant_id, entity_type, entity_id)
  where deleted_at is null;

create table if not exists public.entity_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null references public.entity_type_registry(code),
  entity_id uuid not null,
  activity_type text not null check (activity_type in (
    'call', 'meeting', 'booking', 'invoice', 'payment', 'email', 'whatsapp', 'sms',
    'task', 'workflow', 'ai', 'manual_note', 'timeline'
  )),
  subject text not null,
  body text,
  outcome text,
  duration_seconds integer,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  related_entity_type text references public.entity_type_registry(code),
  related_entity_id uuid,
  attachments jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_entity_activities_entity_occurred
  on public.entity_activities(tenant_id, entity_type, entity_id, occurred_at desc)
  where deleted_at is null;

create index if not exists idx_entity_activities_type
  on public.entity_activities(tenant_id, activity_type, occurred_at desc)
  where deleted_at is null;

create or replace function public.trg_entity_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'entity_contacts', 'entity_files', 'entity_tags', 'entity_custom_fields',
    'entity_custom_field_values', 'entity_activities'
  ] loop
    if not exists (
      select 1
      from pg_trigger tr
      join pg_class c on c.oid = tr.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = t
        and tr.tgname = 'trg_' || t || '_updated_at'
        and not tr.tgisinternal
    ) then
      execute format(
        'create trigger trg_%s_updated_at before update on public.%s for each row execute function public.trg_entity_set_updated_at()',
        t, t
      );
    end if;
  end loop;
end $$;

alter table public.entity_contacts enable row level security;
alter table public.entity_files enable row level security;
alter table public.entity_tags enable row level security;
alter table public.entity_tag_assignments enable row level security;
alter table public.entity_custom_fields enable row level security;
alter table public.entity_custom_field_values enable row level security;
alter table public.entity_activities enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'entity_contacts', 'entity_files', 'entity_tags', 'entity_tag_assignments',
    'entity_custom_fields', 'entity_custom_field_values', 'entity_activities'
  ] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = tbl || '_select') then
      execute format(
        'create policy %I_select on public.%I for select to authenticated using (
          public.is_super_admin() or (tenant_id = public.current_company_id() and deleted_at is null)
        )', tbl, tbl
      );
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = tbl || '_insert') then
      execute format(
        'create policy %I_insert on public.%I for insert to authenticated with check (
          public.is_super_admin() or tenant_id = public.current_company_id()
        )', tbl, tbl
      );
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = tbl || '_update') then
      execute format(
        'create policy %I_update on public.%I for update to authenticated using (
          public.is_super_admin() or tenant_id = public.current_company_id()
        ) with check (
          public.is_super_admin() or tenant_id = public.current_company_id()
        )', tbl, tbl
      );
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = tbl || '_delete') then
      execute format(
        'create policy %I_delete on public.%I for delete to authenticated using (
          public.is_super_admin() or tenant_id = public.current_company_id()
        )', tbl, tbl
      );
    end if;
  end loop;
end $$;

insert into public.permissions (code, category, module, action, description)
values
  ('entity.contacts.read', 'Entity', 'Entity Contacts', 'Read', 'View contacts on any entity'),
  ('entity.contacts.write', 'Entity', 'Entity Contacts', 'Write', 'Create and update entity contacts'),
  ('entity.contacts.delete', 'Entity', 'Entity Contacts', 'Delete', 'Archive entity contacts'),
  ('entity.files.read', 'Entity', 'Entity Files', 'Read', 'View files on any entity'),
  ('entity.files.write', 'Entity', 'Entity Files', 'Write', 'Upload entity files'),
  ('entity.files.delete', 'Entity', 'Entity Files', 'Delete', 'Archive entity files'),
  ('entity.tags.read', 'Entity', 'Entity Tags', 'Read', 'View tags and assignments'),
  ('entity.tags.write', 'Entity', 'Entity Tags', 'Write', 'Manage tags and assignments'),
  ('entity.activities.read', 'Entity', 'Entity Activities', 'Read', 'View entity activity timeline'),
  ('entity.activities.write', 'Entity', 'Entity Activities', 'Write', 'Log entity activities'),
  ('entity.custom_fields.read', 'Entity', 'Custom Fields', 'Read', 'View custom field definitions and values'),
  ('entity.custom_fields.write', 'Entity', 'Custom Fields', 'Write', 'Manage custom field definitions and values')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'entity.contacts.read'),
    ('admin', 'entity.contacts.write'),
    ('admin', 'entity.contacts.delete'),
    ('admin', 'entity.files.read'),
    ('admin', 'entity.files.write'),
    ('admin', 'entity.files.delete'),
    ('admin', 'entity.tags.read'),
    ('admin', 'entity.tags.write'),
    ('admin', 'entity.activities.read'),
    ('admin', 'entity.activities.write'),
    ('admin', 'entity.custom_fields.read'),
    ('admin', 'entity.custom_fields.write'),
    ('manager', 'entity.contacts.read'),
    ('manager', 'entity.contacts.write'),
    ('manager', 'entity.files.read'),
    ('manager', 'entity.files.write'),
    ('manager', 'entity.tags.read'),
    ('manager', 'entity.tags.write'),
    ('manager', 'entity.activities.read'),
    ('manager', 'entity.activities.write'),
    ('manager', 'entity.custom_fields.read'),
    ('employee', 'entity.contacts.read'),
    ('employee', 'entity.files.read'),
    ('employee', 'entity.tags.read'),
    ('employee', 'entity.activities.read'),
    ('employee', 'entity.custom_fields.read')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
inner join public.permissions p
  on p.code = trp.permission_code
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and trp.permission_code like 'entity.%'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

do $$
begin
  alter publication supabase_realtime add table public.entity_contacts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.entity_files;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.entity_tag_assignments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.entity_activities;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.entity_custom_field_values;
exception when duplicate_object then null;
end $$;

comment on table public.entity_contacts is 'Universal contacts — attached to any entity via entity_type + entity_id';

-- =============================================================================
-- 221 — Lead Management GA-1.2
-- =============================================================================

insert into public.permissions (code, category, module, action, description)
values
  ('leads.delete', 'Leads', 'Leads', 'Delete', 'Archive and delete leads'),
  ('leads.export', 'Leads', 'Leads', 'Export', 'Export lead data'),
  ('leads.pipeline.manage', 'Leads', 'Lead Pipeline', 'Manage', 'Configure pipeline stages and transitions')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'leads.delete'),
    ('admin', 'leads.export'),
    ('admin', 'leads.pipeline.manage'),
    ('manager', 'leads.delete'),
    ('manager', 'leads.export'),
    ('manager', 'leads.pipeline.manage')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
inner join public.permissions p
  on p.code = trp.permission_code
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and trp.permission_code in ('leads.delete', 'leads.export', 'leads.pipeline.manage')
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

do $$
begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lead_stages;
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 222 — Tasks and Operations Workspace GA-1.3
-- =============================================================================

insert into public.entity_type_registry (code, label) values
  ('task', 'Task'),
  ('workflow', 'Workflow')
on conflict (code) do nothing;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references auth.users(id) on delete set null,
  entity_type text references public.entity_type_registry(code),
  entity_id uuid,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'paused', 'completed', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  parent_task_id uuid references public.tasks(id) on delete set null,
  recurrence_rule jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create index if not exists idx_tasks_company_entity
  on public.tasks(company_id, entity_type, entity_id)
  where deleted_at is null;

create index if not exists idx_tasks_company_assignee
  on public.tasks(company_id, assignee_id, status)
  where deleted_at is null;

create index if not exists idx_tasks_company_due
  on public.tasks(company_id, due_at)
  where deleted_at is null and status not in ('completed', 'cancelled');

create table if not exists public.operations_workspace_config (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_key text not null default 'clinic',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, template_key)
);

create index if not exists idx_operations_workspace_config_company
  on public.operations_workspace_config(company_id);

alter table public.tasks enable row level security;
alter table public.operations_workspace_config enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select') then
    create policy tasks_select on public.tasks
      for select using (
        company_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_insert') then
    create policy tasks_insert on public.tasks
      for insert with check (
        company_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_update') then
    create policy tasks_update on public.tasks
      for update using (
        company_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_delete') then
    create policy tasks_delete on public.tasks
      for delete using (
        company_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'operations_workspace_config' and policyname = 'operations_workspace_config_select') then
    create policy operations_workspace_config_select on public.operations_workspace_config
      for select using (
        company_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'operations_workspace_config' and policyname = 'operations_workspace_config_insert') then
    create policy operations_workspace_config_insert on public.operations_workspace_config
      for insert with check (
        company_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'operations_workspace_config' and policyname = 'operations_workspace_config_update') then
    create policy operations_workspace_config_update on public.operations_workspace_config
      for update using (
        company_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
end $$;

insert into public.permissions (code, category, module, action, description)
values
  ('operations.read', 'Operations', 'Operations', 'Read', 'View operations queue and workspace'),
  ('operations.write', 'Operations', 'Operations', 'Write', 'Execute operations commands'),
  ('operations.queue.checkin', 'Operations', 'Operations Queue', 'Check In', 'Check in bookings from operations queue'),
  ('operations.queue.complete', 'Operations', 'Operations Queue', 'Complete', 'Complete bookings from operations queue'),
  ('tasks.read', 'Tasks', 'Tasks', 'Read', 'View tasks'),
  ('tasks.write', 'Tasks', 'Tasks', 'Write', 'Create and manage tasks'),
  ('tasks.assign', 'Tasks', 'Tasks', 'Assign', 'Assign tasks to users'),
  ('workflow.read', 'Workflow', 'Workflow', 'Read', 'View workflow executions'),
  ('workflow.execute', 'Workflow', 'Workflow', 'Execute', 'Start and manage workflows'),
  ('knowledge.read', 'Knowledge', 'Knowledge', 'Read', 'Query knowledge base'),
  ('knowledge.manage', 'Knowledge', 'Knowledge', 'Manage', 'Manage knowledge documents')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'operations.read'),
    ('admin', 'operations.write'),
    ('admin', 'operations.queue.checkin'),
    ('admin', 'operations.queue.complete'),
    ('admin', 'tasks.read'),
    ('admin', 'tasks.write'),
    ('admin', 'tasks.assign'),
    ('admin', 'workflow.read'),
    ('admin', 'workflow.execute'),
    ('admin', 'knowledge.read'),
    ('admin', 'knowledge.manage'),
    ('manager', 'operations.read'),
    ('manager', 'operations.write'),
    ('manager', 'operations.queue.checkin'),
    ('manager', 'operations.queue.complete'),
    ('manager', 'tasks.read'),
    ('manager', 'tasks.write'),
    ('manager', 'tasks.assign'),
    ('manager', 'workflow.read'),
    ('manager', 'workflow.execute'),
    ('manager', 'knowledge.read'),
    ('employee', 'operations.read'),
    ('employee', 'tasks.read'),
    ('employee', 'tasks.write'),
    ('employee', 'knowledge.read')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
inner join public.permissions p
  on p.code = trp.permission_code
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and trp.permission_code in (
    'operations.read',
    'operations.write',
    'operations.queue.checkin',
    'operations.queue.complete',
    'tasks.read',
    'tasks.write',
    'tasks.assign',
    'workflow.read',
    'workflow.execute',
    'knowledge.read',
    'knowledge.manage'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.operations_workspace_config;
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 223 — Enterprise Configuration Platform GA-1.4
-- =============================================================================

create table if not exists public.configuration_domain_registry (
  code text primary key,
  label text not null,
  category text not null default 'platform',
  created_at timestamptz not null default now()
);

insert into public.configuration_domain_registry (code, label, category) values
  ('workspace', 'Workspace', 'workspace'),
  ('crm', 'CRM', 'crm'),
  ('operations', 'Operations', 'operations'),
  ('operations.workspace', 'Operations Workspace', 'operations'),
  ('bookings', 'Bookings', 'operations'),
  ('scheduling', 'Scheduling', 'operations'),
  ('calendar', 'Calendar', 'operations'),
  ('billing', 'Billing', 'billing'),
  ('notifications', 'Notifications', 'notifications'),
  ('automation', 'Automation', 'automation'),
  ('ai', 'AI', 'ai'),
  ('knowledge', 'Knowledge', 'knowledge'),
  ('dashboard', 'Dashboard', 'dashboard'),
  ('customer_portal', 'Customer Portal', 'portal'),
  ('employee_portal', 'Employee Portal', 'portal'),
  ('public_booking', 'Public Booking', 'portal'),
  ('global_search', 'Global Search', 'platform'),
  ('reports', 'Reports', 'platform')
on conflict (code) do nothing;

create table if not exists public.platform_configurations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  domain text not null references public.configuration_domain_registry(code),
  scope_key text not null default 'default',
  status text not null default 'published'
    check (status in ('draft', 'published')),
  version integer not null default 1,
  published_config jsonb not null default '{}'::jsonb,
  draft_config jsonb,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, domain, scope_key)
);

create index if not exists idx_platform_configurations_tenant_domain
  on public.platform_configurations(tenant_id, domain);

create table if not exists public.platform_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.platform_configurations(id) on delete cascade,
  tenant_id uuid not null references public.companies(id) on delete cascade,
  version integer not null,
  config jsonb not null default '{}'::jsonb,
  action text not null default 'publish'
    check (action in ('draft', 'publish', 'rollback', 'restore')),
  change_summary text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_configuration_versions_config
  on public.platform_configuration_versions(configuration_id, version desc);

insert into public.platform_configurations (
  tenant_id,
  domain,
  scope_key,
  status,
  version,
  published_config,
  draft_config,
  published_at,
  published_by,
  updated_at,
  updated_by
)
select
  owc.company_id,
  'operations.workspace',
  owc.template_key,
  'published',
  1,
  owc.config,
  null,
  owc.updated_at,
  owc.updated_by,
  owc.updated_at,
  owc.updated_by
from public.operations_workspace_config owc
where not exists (
  select 1 from public.platform_configurations pc
  where pc.tenant_id = owc.company_id
    and pc.domain = 'operations.workspace'
    and pc.scope_key = owc.template_key
);

alter table public.platform_configurations enable row level security;
alter table public.platform_configuration_versions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_configurations' and policyname = 'platform_configurations_select') then
    create policy platform_configurations_select on public.platform_configurations
      for select using (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_configurations' and policyname = 'platform_configurations_insert') then
    create policy platform_configurations_insert on public.platform_configurations
      for insert with check (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_configurations' and policyname = 'platform_configurations_update') then
    create policy platform_configurations_update on public.platform_configurations
      for update using (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_configuration_versions' and policyname = 'platform_configuration_versions_select') then
    create policy platform_configuration_versions_select on public.platform_configuration_versions
      for select using (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_configuration_versions' and policyname = 'platform_configuration_versions_insert') then
    create policy platform_configuration_versions_insert on public.platform_configuration_versions
      for insert with check (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
end $$;

insert into public.permissions (code, category, module, action, description)
values
  ('configuration.read', 'Configuration', 'Configuration', 'Read', 'View platform configuration'),
  ('configuration.write', 'Configuration', 'Configuration', 'Write', 'Edit platform configuration drafts'),
  ('configuration.publish', 'Configuration', 'Configuration', 'Publish', 'Publish configuration changes'),
  ('configuration.workspace.read', 'Configuration', 'Workspace', 'Read', 'View workspace configuration'),
  ('configuration.workspace.write', 'Configuration', 'Workspace', 'Write', 'Edit workspace configuration'),
  ('configuration.crm.read', 'Configuration', 'CRM', 'Read', 'View CRM configuration'),
  ('configuration.crm.write', 'Configuration', 'CRM', 'Write', 'Edit CRM configuration'),
  ('configuration.operations.read', 'Configuration', 'Operations', 'Read', 'View operations configuration'),
  ('configuration.operations.write', 'Configuration', 'Operations', 'Write', 'Edit operations configuration'),
  ('configuration.billing.read', 'Configuration', 'Billing', 'Read', 'View billing configuration'),
  ('configuration.billing.write', 'Configuration', 'Billing', 'Write', 'Edit billing configuration'),
  ('configuration.ai.read', 'Configuration', 'AI', 'Read', 'View AI configuration'),
  ('configuration.ai.write', 'Configuration', 'AI', 'Write', 'Edit AI configuration'),
  ('configuration.dashboard.read', 'Configuration', 'Dashboard', 'Read', 'View dashboard configuration'),
  ('configuration.dashboard.write', 'Configuration', 'Dashboard', 'Write', 'Edit dashboard configuration'),
  ('operations.universal.configure', 'Operations', 'Universal Operations', 'Configure', 'Manage universal operations configuration'),
  ('operations.configuration.manage', 'Operations', 'Operations Config', 'Manage', 'Legacy operations config permission')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'configuration.read'),
    ('admin', 'configuration.write'),
    ('admin', 'configuration.publish'),
    ('admin', 'configuration.workspace.read'),
    ('admin', 'configuration.workspace.write'),
    ('admin', 'configuration.crm.read'),
    ('admin', 'configuration.crm.write'),
    ('admin', 'configuration.operations.read'),
    ('admin', 'configuration.operations.write'),
    ('admin', 'configuration.billing.read'),
    ('admin', 'configuration.billing.write'),
    ('admin', 'configuration.ai.read'),
    ('admin', 'configuration.ai.write'),
    ('admin', 'configuration.dashboard.read'),
    ('admin', 'configuration.dashboard.write'),
    ('admin', 'operations.universal.configure'),
    ('admin', 'operations.configuration.manage'),
    ('manager', 'configuration.read'),
    ('manager', 'configuration.write'),
    ('manager', 'configuration.publish'),
    ('manager', 'configuration.workspace.read'),
    ('manager', 'configuration.workspace.write'),
    ('manager', 'configuration.operations.read'),
    ('manager', 'configuration.operations.write'),
    ('manager', 'operations.universal.configure'),
    ('manager', 'operations.configuration.manage')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
inner join public.permissions p
  on p.code = trp.permission_code
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and trp.permission_code in (
    'configuration.read',
    'configuration.write',
    'configuration.publish',
    'configuration.workspace.read',
    'configuration.workspace.write',
    'configuration.crm.read',
    'configuration.crm.write',
    'configuration.operations.read',
    'configuration.operations.write',
    'configuration.billing.read',
    'configuration.billing.write',
    'configuration.ai.read',
    'configuration.ai.write',
    'configuration.dashboard.read',
    'configuration.dashboard.write',
    'operations.universal.configure',
    'operations.configuration.manage'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

do $$
begin
  alter publication supabase_realtime add table public.platform_configurations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.platform_configuration_versions;
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 224 — Feature Flags and Licensing GA-1.4
-- =============================================================================

create table if not exists public.platform_feature_flag_registry (
  feature_key text primary key,
  label text not null,
  category text not null default 'platform',
  description text,
  default_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.platform_feature_flag_registry (feature_key, label, category) values
  ('ai.employee', 'AI Employee', 'ai'),
  ('ai.chat', 'AI Chat', 'ai'),
  ('ai.analytics', 'AI Analytics', 'ai'),
  ('knowledge.platform', 'Knowledge Platform', 'knowledge'),
  ('workflow.automation', 'Workflow Automation', 'automation'),
  ('customer.portal', 'Customer Portal', 'portal'),
  ('employee.portal', 'Employee Portal', 'portal'),
  ('public.booking', 'Public Booking', 'booking'),
  ('channel.whatsapp', 'WhatsApp', 'omnichannel'),
  ('channel.instagram', 'Instagram', 'omnichannel'),
  ('channel.facebook', 'Facebook', 'omnichannel'),
  ('channel.voice', 'Voice Calling', 'omnichannel'),
  ('dashboard.executive', 'Executive Dashboard', 'dashboard'),
  ('analytics.advanced', 'Advanced Analytics', 'analytics'),
  ('reports.enterprise', 'Enterprise Reports', 'reports'),
  ('leads.management', 'Lead Management', 'crm'),
  ('tasks.management', 'Task Management', 'operations'),
  ('operations.workspace', 'Operations Workspace', 'operations'),
  ('call.center', 'Call Center', 'call_center'),
  ('omnichannel', 'Omnichannel', 'omnichannel'),
  ('tool.calling', 'Tool Calling', 'ai'),
  ('embeddings', 'Embeddings', 'ai')
on conflict (feature_key) do nothing;

create table if not exists public.platform_feature_flags (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null references public.platform_feature_flag_registry(feature_key),
  scope_type text not null check (scope_type in ('global', 'plan', 'company', 'branch', 'department', 'role', 'user')),
  scope_id text,
  enabled boolean not null default true,
  rollout_percentage integer not null default 100 check (rollout_percentage >= 0 and rollout_percentage <= 100),
  environment text not null default 'all' check (environment in ('all', 'development', 'staging', 'production')),
  activates_at timestamptz,
  expires_at timestamptz,
  prerequisites jsonb not null default '[]'::jsonb,
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (feature_key, scope_type, scope_id, environment)
);

create index if not exists idx_platform_feature_flags_scope
  on public.platform_feature_flags(scope_type, scope_id);

create index if not exists idx_platform_feature_flags_feature
  on public.platform_feature_flags(feature_key);

create table if not exists public.platform_feature_flag_versions (
  id uuid primary key default gen_random_uuid(),
  feature_flag_id uuid not null references public.platform_feature_flags(id) on delete cascade,
  tenant_id uuid references public.companies(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  action text not null default 'update' check (action in ('create', 'update', 'rollback', 'restore')),
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_feature_flag_versions_flag
  on public.platform_feature_flag_versions(feature_flag_id, version desc);

create table if not exists public.platform_plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  plan_code text not null,
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  modules jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id)
);

create index if not exists idx_platform_plan_entitlements_code
  on public.platform_plan_entitlements(plan_code);

insert into public.platform_plan_entitlements (plan_id, plan_code, features, limits, modules)
select
  p.id,
  p.code,
  case p.code
    when 'enterprise' then '{"ai.employee":true,"ai.chat":true,"ai.analytics":true,"knowledge.platform":true,"workflow.automation":true,"customer.portal":true,"employee.portal":true,"public.booking":true,"dashboard.executive":true,"analytics.advanced":true,"reports.enterprise":true,"leads.management":true,"tasks.management":true,"operations.workspace":true,"call.center":true,"omnichannel":true,"channel.whatsapp":true,"channel.instagram":true,"channel.facebook":true,"channel.voice":true,"tool.calling":true,"embeddings":true,"api.access":true}'::jsonb
    when 'pro' then '{"ai.chat":true,"knowledge.platform":true,"workflow.automation":true,"customer.portal":true,"public.booking":true,"leads.management":true,"tasks.management":true,"operations.workspace":true,"channel.whatsapp":true,"embeddings":true}'::jsonb
    else '{"ai.chat":true,"leads.management":true,"operations.workspace":true,"public.booking":true}'::jsonb
  end,
  case p.code
    when 'enterprise' then '{"users":500,"branches":50,"storage_gb":500,"ai_tokens_monthly":1000000,"bookings_monthly":50000,"customers":100000,"workflows":500}'::jsonb
    when 'pro' then '{"users":50,"branches":10,"storage_gb":100,"ai_tokens_monthly":200000,"bookings_monthly":10000,"customers":20000,"workflows":100}'::jsonb
    else '{"users":10,"branches":2,"storage_gb":20,"ai_tokens_monthly":50000,"bookings_monthly":2000,"customers":5000,"workflows":20}'::jsonb
  end,
  case p.code
    when 'enterprise' then '["*"]'::jsonb
    when 'pro' then '["crm","operations","booking","knowledge","automation"]'::jsonb
    else '["crm","operations","booking"]'::jsonb
  end
from public.plans p
where not exists (select 1 from public.platform_plan_entitlements pe where pe.plan_id = p.id);

create table if not exists public.platform_company_licenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade unique,
  plan_id uuid references public.plans(id) on delete set null,
  plan_code text not null default 'basic',
  status text not null default 'active' check (status in ('active', 'trial', 'grace', 'expired', 'suspended')),
  trial_ends_at timestamptz,
  expires_at timestamptz,
  grace_ends_at timestamptz,
  add_ons jsonb not null default '[]'::jsonb,
  usage_counters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_company_licenses (tenant_id, plan_id, plan_code, status)
select
  c.id,
  c.plan_id,
  coalesce(p.code, lower(coalesce(c.subscription_plan, 'basic'))),
  'active'
from public.companies c
left join public.plans p on p.id = c.plan_id
where not exists (select 1 from public.platform_company_licenses l where l.tenant_id = c.id);

insert into public.platform_feature_flags (feature_key, scope_type, scope_id, enabled, environment, updated_by)
select
  mapped.feature_key,
  'company',
  ff.company_id::text,
  ff.is_enabled,
  'all',
  ff.updated_by
from public.platform_ai_feature_flags ff
cross join lateral (
  select case ff.feature_key
    when 'knowledge' then 'knowledge.platform'
    when 'automation' then 'workflow.automation'
    when 'ai_chat' then 'ai.chat'
    when 'ai_agents' then 'ai.employee'
    when 'ai_analytics' then 'ai.analytics'
    when 'tool_calling' then 'tool.calling'
    when 'embeddings' then 'embeddings'
    when 'voice' then 'channel.voice'
    else ff.feature_key
  end as feature_key
) mapped
where exists (
  select 1
  from public.platform_feature_flag_registry r
  where r.feature_key = mapped.feature_key
)
and not exists (
  select 1
  from public.platform_feature_flags existing
  where existing.feature_key = mapped.feature_key
    and existing.scope_type = 'company'
    and existing.scope_id = ff.company_id::text
    and existing.environment = 'all'
);

alter table public.platform_feature_flags enable row level security;
alter table public.platform_feature_flag_versions enable row level security;
alter table public.platform_plan_entitlements enable row level security;
alter table public.platform_company_licenses enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_feature_flags' and policyname = 'platform_feature_flags_select') then
    create policy platform_feature_flags_select on public.platform_feature_flags
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_feature_flags' and policyname = 'platform_feature_flags_write') then
    create policy platform_feature_flags_write on public.platform_feature_flags
      for all using (
        exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
        or scope_type = 'company' and scope_id in (
          select company_id::text from public.profiles where id = auth.uid()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_feature_flag_versions' and policyname = 'platform_feature_flag_versions_select') then
    create policy platform_feature_flag_versions_select on public.platform_feature_flag_versions
      for select using (
        tenant_id is null
        or tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_plan_entitlements' and policyname = 'platform_plan_entitlements_select') then
    create policy platform_plan_entitlements_select on public.platform_plan_entitlements
      for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_company_licenses' and policyname = 'platform_company_licenses_select') then
    create policy platform_company_licenses_select on public.platform_company_licenses
      for select using (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_company_licenses' and policyname = 'platform_company_licenses_write') then
    create policy platform_company_licenses_write on public.platform_company_licenses
      for update using (
        exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
end $$;

insert into public.permissions (code, category, module, action, description)
values
  ('feature_flags.read', 'Feature Flags', 'Feature Flags', 'Read', 'View feature flag state'),
  ('feature_flags.write', 'Feature Flags', 'Feature Flags', 'Write', 'Manage feature flags'),
  ('feature_flags.publish', 'Feature Flags', 'Feature Flags', 'Publish', 'Publish feature flag changes'),
  ('licenses.read', 'Licenses', 'Licenses', 'Read', 'View license and entitlements'),
  ('licenses.write', 'Licenses', 'Licenses', 'Write', 'Manage company licenses'),
  ('licenses.assign', 'Licenses', 'Licenses', 'Assign', 'Assign plans and add-ons'),
  ('configuration.notifications.read', 'Configuration', 'Notifications', 'Read', 'View notification configuration'),
  ('configuration.notifications.write', 'Configuration', 'Notifications', 'Write', 'Edit notification configuration')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.platform_role_template_permissions (template_key, permission_code)
select seed.template_key, seed.permission_code
from (
  values
    ('admin', 'feature_flags.read'),
    ('admin', 'feature_flags.write'),
    ('admin', 'feature_flags.publish'),
    ('admin', 'licenses.read'),
    ('admin', 'licenses.write'),
    ('admin', 'licenses.assign'),
    ('admin', 'configuration.notifications.read'),
    ('admin', 'configuration.notifications.write'),
    ('manager', 'feature_flags.read'),
    ('manager', 'licenses.read'),
    ('employee', 'feature_flags.read'),
    ('employee', 'licenses.read')
) as seed(template_key, permission_code)
where not exists (
  select 1
  from public.platform_role_template_permissions existing
  where existing.template_key = seed.template_key
    and existing.permission_code = seed.permission_code
);

insert into public.role_permissions (role_id, permission_id)
select distinct r.id, p.id
from public.roles r
inner join public.platform_role_template_permissions trp
  on trp.template_key = r.template_key
inner join public.permissions p
  on p.code = trp.permission_code
where r.role_type = 'DEFAULT'
  and r.company_id is not null
  and trp.permission_code in (
    'feature_flags.read',
    'feature_flags.write',
    'feature_flags.publish',
    'licenses.read',
    'licenses.write',
    'licenses.assign',
    'configuration.notifications.read',
    'configuration.notifications.write'
  )
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

do $$
begin
  alter publication supabase_realtime add table public.platform_feature_flags;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.platform_company_licenses;
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 225 — Enterprise Reactive Platform GA-1.5
-- =============================================================================

create table if not exists public.platform_event_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  correlation_id text not null,
  causation_id text,
  actor_id uuid,
  actor_type text not null default 'system',
  source_module text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  envelope jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_event_audit_tenant
  on public.platform_event_audit(tenant_id, occurred_at desc);
create index if not exists idx_platform_event_audit_correlation
  on public.platform_event_audit(correlation_id);
create unique index if not exists idx_platform_event_audit_event_id
  on public.platform_event_audit(event_id);

create table if not exists public.platform_event_timeline (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  correlation_id text not null,
  entity_type text,
  entity_id text,
  actor_id uuid,
  title text not null,
  description text not null,
  source_module text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_event_timeline_entity
  on public.platform_event_timeline(tenant_id, entity_type, entity_id, occurred_at desc);
create index if not exists idx_platform_event_timeline_tenant
  on public.platform_event_timeline(tenant_id, occurred_at desc);

create table if not exists public.platform_event_dlq (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  subscriber_id text not null,
  event_id text not null,
  event_type text not null,
  correlation_id text not null,
  envelope jsonb not null,
  error text not null,
  attempts integer not null default 1,
  replayed_at timestamptz,
  dead_lettered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_event_dlq_subscriber
  on public.platform_event_dlq(subscriber_id, dead_lettered_at desc);
create index if not exists idx_platform_event_dlq_tenant
  on public.platform_event_dlq(tenant_id, dead_lettered_at desc);

create table if not exists public.platform_event_subscriber_telemetry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.companies(id) on delete cascade,
  subscriber_id text not null,
  event_id text not null,
  event_type text not null,
  correlation_id text not null,
  success boolean not null,
  latency_ms integer not null default 0,
  error text,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_platform_event_subscriber_telemetry_sub
  on public.platform_event_subscriber_telemetry(subscriber_id, recorded_at desc);

create table if not exists public.platform_event_correlations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  correlation_id text not null,
  root_event_id text not null,
  event_id text not null,
  event_type text not null,
  parent_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_event_correlations_corr
  on public.platform_event_correlations(correlation_id);
create unique index if not exists idx_platform_event_correlations_event
  on public.platform_event_correlations(event_id);

create table if not exists public.platform_event_idempotency (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  result_hash text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, scope, idempotency_key)
);

create index if not exists idx_platform_event_idempotency_expires
  on public.platform_event_idempotency(expires_at)
  where expires_at is not null;

create table if not exists public.platform_reactive_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete cascade,
  signal_type text not null,
  entity_type text,
  entity_id text,
  correlation_id text not null,
  source_subscriber text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_reactive_signals_tenant
  on public.platform_reactive_signals(tenant_id, created_at desc);

alter table public.platform_event_audit enable row level security;
alter table public.platform_event_timeline enable row level security;
alter table public.platform_event_dlq enable row level security;
alter table public.platform_event_subscriber_telemetry enable row level security;
alter table public.platform_event_correlations enable row level security;
alter table public.platform_event_idempotency enable row level security;
alter table public.platform_reactive_signals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_audit' and policyname = 'platform_event_audit_select') then
    create policy platform_event_audit_select on public.platform_event_audit
      for select using (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_timeline' and policyname = 'platform_event_timeline_select') then
    create policy platform_event_timeline_select on public.platform_event_timeline
      for select using (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_dlq' and policyname = 'platform_event_dlq_select') then
    create policy platform_event_dlq_select on public.platform_event_dlq
      for select using (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_reactive_signals' and policyname = 'platform_reactive_signals_select') then
    create policy platform_reactive_signals_select on public.platform_reactive_signals
      for select using (
        tenant_id in (select company_id from public.profiles where id = auth.uid())
        or exists (select 1 from public.profiles where id = auth.uid() and is_super_admin = true)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_audit' and policyname = 'platform_event_audit_insert') then
    create policy platform_event_audit_insert on public.platform_event_audit
      for insert with check (auth.role() in ('authenticated', 'service_role'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_timeline' and policyname = 'platform_event_timeline_insert') then
    create policy platform_event_timeline_insert on public.platform_event_timeline
      for insert with check (auth.role() in ('authenticated', 'service_role'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_dlq' and policyname = 'platform_event_dlq_insert') then
    create policy platform_event_dlq_insert on public.platform_event_dlq
      for insert with check (auth.role() in ('authenticated', 'service_role'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_subscriber_telemetry' and policyname = 'platform_event_subscriber_telemetry_insert') then
    create policy platform_event_subscriber_telemetry_insert on public.platform_event_subscriber_telemetry
      for insert with check (auth.role() in ('authenticated', 'service_role'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_correlations' and policyname = 'platform_event_correlations_insert') then
    create policy platform_event_correlations_insert on public.platform_event_correlations
      for insert with check (auth.role() in ('authenticated', 'service_role'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_idempotency' and policyname = 'platform_event_idempotency_all') then
    create policy platform_event_idempotency_all on public.platform_event_idempotency
      for all using (auth.role() in ('authenticated', 'service_role'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_reactive_signals' and policyname = 'platform_reactive_signals_insert') then
    create policy platform_reactive_signals_insert on public.platform_reactive_signals
      for insert with check (auth.role() in ('authenticated', 'service_role'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_event_dlq' and policyname = 'platform_event_dlq_update') then
    create policy platform_event_dlq_update on public.platform_event_dlq
      for update using (auth.role() in ('authenticated', 'service_role'));
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.platform_reactive_signals;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.platform_event_timeline;
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 227 — Appointment Platform Promotion
-- =============================================================================

alter table public.scheduling_bookings
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

create index if not exists idx_scheduling_bookings_company_lead
  on public.scheduling_bookings(company_id, lead_id)
  where deleted_at is null and lead_id is not null;

create index if not exists idx_scheduling_bookings_company_conversation
  on public.scheduling_bookings(company_id, conversation_id)
  where deleted_at is null and conversation_id is not null;

create index if not exists idx_scheduling_bookings_company_status_start
  on public.scheduling_bookings(company_id, status, start_at)
  where deleted_at is null;

create or replace function public.appointment_platform_company_metrics_v1(
  p_company_id uuid,
  p_period_start timestamptz default date_trunc('month', now())
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_prev_start timestamptz := p_period_start - (v_now - p_period_start);
  v_result jsonb;
begin
  if not (
    public.is_super_admin()
    or (p_company_id = public.current_company_id() and public.user_has_permission('bookings.view'))
  ) then
    raise exception 'permission denied';
  end if;

  select jsonb_build_object(
    'upcoming', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.start_at >= v_now
        and b.status in ('pending', 'confirmed', 'checked_in')
    ), 0),
    'completedInPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.status = 'completed'
        and b.updated_at >= p_period_start
    ), 0),
    'cancelledInPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.status = 'cancelled'
        and b.updated_at >= p_period_start
    ), 0),
    'noShowInPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.status = 'no_show'
        and b.updated_at >= p_period_start
    ), 0),
    'createdInPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.created_at >= p_period_start
    ), 0),
    'createdPreviousPeriod', coalesce((
      select count(*)::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.created_at >= v_prev_start
        and b.created_at < p_period_start
    ), 0),
    'averageDurationMinutes', coalesce((
      select round(avg(extract(epoch from (b.end_at - b.start_at)) / 60.0))::int
      from public.scheduling_bookings b
      where b.company_id = p_company_id
        and b.deleted_at is null
        and b.status = 'completed'
        and b.updated_at >= p_period_start
    ), 0),
    'resourceUtilizationPercent', coalesce((
      select case
        when total_slots = 0 then 0
        else round((booked_minutes::numeric / total_slots) * 100)::int
      end
      from (
        select
          coalesce(sum(extract(epoch from (b.end_at - b.start_at)) / 60.0), 0) as booked_minutes,
          greatest(count(distinct b.resource_id), 1) * 480 as total_slots
        from public.scheduling_bookings b
        where b.company_id = p_company_id
          and b.deleted_at is null
          and b.start_at >= p_period_start
          and b.status in ('pending', 'confirmed', 'checked_in', 'completed')
      ) util
    ), 0)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.appointment_platform_company_metrics_v1(uuid, timestamptz) to authenticated, service_role;

comment on function public.appointment_platform_company_metrics_v1 is
  'Aggregated appointment metrics for dashboard — Sprint 6.12.';
