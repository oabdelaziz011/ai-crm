-- Sprint 6.10: Enterprise Human Handoff Platform — queues, ownership, presence, escalations, analytics.

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
on conflict do nothing;

-- Routing queues
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

-- Queue membership
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

-- Current conversation ownership (single owner invariant)
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

-- Ownership transition history
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

-- Handoff / escalation requests
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

-- Context transfer snapshots
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

-- Agent presence
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

-- Escalation rules
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

-- RLS
alter table public.handoff_queues enable row level security;
alter table public.handoff_queue_members enable row level security;
alter table public.handoff_conversation_ownership enable row level security;
alter table public.handoff_ownership_history enable row level security;
alter table public.handoff_requests enable row level security;
alter table public.handoff_context_snapshots enable row level security;
alter table public.agent_presence enable row level security;
alter table public.handoff_escalation_rules enable row level security;

create policy handoff_queues_tenant on public.handoff_queues
  for all using (public.company_has_permission(company_id, 'handoff.view'));

create policy handoff_queue_members_tenant on public.handoff_queue_members
  for all using (public.company_has_permission(company_id, 'handoff.view'));

create policy handoff_ownership_tenant on public.handoff_conversation_ownership
  for all using (public.company_has_permission(company_id, 'handoff.view'));

create policy handoff_ownership_history_tenant on public.handoff_ownership_history
  for all using (public.company_has_permission(company_id, 'handoff.view'));

create policy handoff_requests_tenant on public.handoff_requests
  for all using (public.company_has_permission(company_id, 'handoff.view'));

create policy handoff_context_snapshots_tenant on public.handoff_context_snapshots
  for all using (public.company_has_permission(company_id, 'handoff.view'));

create policy agent_presence_tenant on public.agent_presence
  for all using (public.company_has_permission(company_id, 'handoff.view'));

create policy handoff_escalation_rules_tenant on public.handoff_escalation_rules
  for all using (public.company_has_permission(company_id, 'handoff.view'));

-- Realtime publication
alter publication supabase_realtime add table public.handoff_conversation_ownership;
alter publication supabase_realtime add table public.handoff_requests;
alter publication supabase_realtime add table public.agent_presence;

-- Analytics RPC (SQL aggregation — no full-table hydration)
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
