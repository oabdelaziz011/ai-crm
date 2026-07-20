-- ============================================================
-- Vault OS – Sprint B1-01: Automation Platform Foundation
-- Channel-independent workflow engine schema, RLS, RBAC, audit.
-- ============================================================

-- ── automation_flows ────────────────────────────────────────

create table if not exists public.automation_flows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  trigger_type text not null
    check (trigger_type in ('manual', 'webhook', 'inbound_message', 'schedule', 'api_event')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'disabled')),
  version integer not null default 1 check (version >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_automation_flows_company_id
  on public.automation_flows(company_id)
  where deleted_at is null;

create index if not exists idx_automation_flows_company_status
  on public.automation_flows(company_id, status)
  where deleted_at is null;

create index if not exists idx_automation_flows_company_trigger
  on public.automation_flows(company_id, trigger_type)
  where deleted_at is null;

create trigger trg_automation_flows_updated_at
  before update on public.automation_flows
  for each row execute procedure public.set_updated_at();

-- ── automation_nodes ────────────────────────────────────────

create table if not exists public.automation_nodes (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.automation_flows(id) on delete cascade,
  type text not null
    check (type in ('trigger', 'action', 'condition', 'delay', 'end')),
  config jsonb not null default '{}'::jsonb,
  position_x numeric(10, 2) not null default 0,
  position_y numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_nodes_flow_id
  on public.automation_nodes(flow_id);

create index if not exists idx_automation_nodes_flow_type
  on public.automation_nodes(flow_id, type);

-- ── automation_edges ────────────────────────────────────────

create table if not exists public.automation_edges (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.automation_flows(id) on delete cascade,
  source_node_id uuid not null references public.automation_nodes(id) on delete cascade,
  target_node_id uuid not null references public.automation_nodes(id) on delete cascade,
  condition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint automation_edges_distinct_nodes check (source_node_id <> target_node_id)
);

create index if not exists idx_automation_edges_flow_id
  on public.automation_edges(flow_id);

create index if not exists idx_automation_edges_source
  on public.automation_edges(flow_id, source_node_id);

create index if not exists idx_automation_edges_target
  on public.automation_edges(flow_id, target_node_id);

-- ── automation_runs ─────────────────────────────────────────

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  flow_id uuid not null references public.automation_flows(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  trigger_source text not null default 'manual',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_automation_runs_company_id
  on public.automation_runs(company_id, started_at desc);

create index if not exists idx_automation_runs_flow_id
  on public.automation_runs(flow_id, started_at desc);

create index if not exists idx_automation_runs_status
  on public.automation_runs(company_id, status)
  where status in ('queued', 'running');

-- ── conversation_sessions (automation runtime) ──────────────

create table if not exists public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null
    check (channel in ('web_chat', 'whatsapp', 'email', 'api', 'messenger', 'telegram', 'instagram', 'voice')),
  external_user_id text,
  customer_id uuid references public.customers(id) on delete set null,
  flow_id uuid references public.automation_flows(id) on delete set null,
  current_node_id uuid references public.automation_nodes(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'expired', 'cancelled')),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_conversation_sessions_company_id
  on public.conversation_sessions(company_id, last_activity_at desc);

create index if not exists idx_conversation_sessions_flow_id
  on public.conversation_sessions(flow_id)
  where flow_id is not null;

create index if not exists idx_conversation_sessions_external_user
  on public.conversation_sessions(company_id, channel, external_user_id)
  where external_user_id is not null;

create index if not exists idx_conversation_sessions_status
  on public.conversation_sessions(company_id, status)
  where status in ('active', 'paused');

-- ── automation_session_messages (spec: conversation_messages) ─

create table if not exists public.automation_session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.conversation_sessions(id) on delete cascade,
  sender_type text not null
    check (sender_type in ('user', 'system', 'automation', 'agent')),
  message_type text not null default 'text'
    check (message_type in ('text', 'event', 'command', 'payload')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_session_messages_session_id
  on public.automation_session_messages(session_id, created_at);

-- ── RBAC permissions ────────────────────────────────────────

insert into public.permissions (code, category, module, action, description)
values
  ('automation.view', 'Automation', 'Automation', 'View', 'View automation flows and runs'),
  ('automation.create', 'Automation', 'Automation', 'Create', 'Create automation flows'),
  ('automation.edit', 'Automation', 'Automation', 'Edit', 'Edit automation flows'),
  ('automation.delete', 'Automation', 'Automation', 'Delete', 'Delete automation flows'),
  ('automation.publish', 'Automation', 'Automation', 'Publish', 'Publish automation flows'),
  ('automation.execute', 'Automation', 'Automation', 'Execute', 'Execute automation flows and sessions')
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
    ('admin', 'automation.view'),
    ('admin', 'automation.create'),
    ('admin', 'automation.edit'),
    ('admin', 'automation.delete'),
    ('admin', 'automation.publish'),
    ('admin', 'automation.execute')
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
join public.permissions p on p.code like 'automation.%'
where r.role_type = 'DEFAULT'
  and r.template_key = 'admin'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

-- ── Audit event helpers ─────────────────────────────────────

create or replace function public.automation_flow_audit_events(
  p_old public.automation_flows,
  p_new public.automation_flows,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('flow_created');
  end if;

  if p_op = 'UPDATE' then
    if p_old.deleted_at is null and p_new.deleted_at is not null then
      return jsonb_build_array('flow_deleted');
    end if;

    if p_old.status is distinct from p_new.status then
      if p_new.status = 'active' then
        return jsonb_build_array('flow_published');
      elsif p_new.status = 'disabled' then
        return jsonb_build_array('flow_disabled');
      end if;
    end if;

    if p_old.name is distinct from p_new.name
       or p_old.description is distinct from p_new.description
       or p_old.trigger_type is distinct from p_new.trigger_type
       or p_old.version is distinct from p_new.version then
      return jsonb_build_array('flow_updated');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.automation_run_audit_events(
  p_old public.automation_runs,
  p_new public.automation_runs,
  p_op text
)
returns jsonb
language plpgsql
stable
as $$
begin
  if p_op = 'INSERT' then
    return jsonb_build_array('run_started');
  end if;

  if p_op = 'UPDATE' and p_old.status is distinct from p_new.status then
    if p_new.status = 'completed' then
      return jsonb_build_array('run_completed');
    elsif p_new.status = 'failed' then
      return jsonb_build_array('run_failed');
    elsif p_new.status = 'cancelled' then
      return jsonb_build_array('run_cancelled');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

create or replace function public.write_automation_audit_log()
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
  v_events jsonb := '[]'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;

  if TG_TABLE_NAME = 'automation_flows' then
    v_company_id := coalesce(new.company_id, old.company_id);
    v_events := public.automation_flow_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'name', coalesce(new.name, old.name),
      'status', coalesce(new.status, old.status),
      'trigger_type', coalesce(new.trigger_type, old.trigger_type),
      'version', coalesce(new.version, old.version)
    );
  elsif TG_TABLE_NAME = 'automation_runs' then
    v_company_id := coalesce(new.company_id, old.company_id);
    v_events := public.automation_run_audit_events(old, new, TG_OP);
    if v_events = '[]'::jsonb then
      if TG_OP = 'DELETE' then return old; end if;
      return new;
    end if;
    v_metadata := jsonb_build_object(
      'events', v_events,
      'flow_id', coalesce(new.flow_id, old.flow_id),
      'status', coalesce(new.status, old.status),
      'trigger_source', coalesce(new.trigger_source, old.trigger_source)
    );
  else
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.audit_logs (
    user_id,
    company_id,
    action,
    entity,
    entity_id,
    ip_address,
    metadata,
    created_at
  )
  values (
    auth.uid(),
    v_company_id,
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    public.request_ip_address(),
    v_metadata,
    now()
  );

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_automation_flows on public.automation_flows;
create trigger trg_audit_automation_flows
  after insert or update or delete on public.automation_flows
  for each row execute procedure public.write_automation_audit_log();

drop trigger if exists trg_audit_automation_runs on public.automation_runs;
create trigger trg_audit_automation_runs
  after insert or update or delete on public.automation_runs
  for each row execute procedure public.write_automation_audit_log();

-- ── Row Level Security ──────────────────────────────────────

alter table public.automation_flows enable row level security;
alter table public.automation_nodes enable row level security;
alter table public.automation_edges enable row level security;
alter table public.automation_runs enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.automation_session_messages enable row level security;

-- automation_flows
create policy automation_flows_select on public.automation_flows for select using (
  deleted_at is null
  and public.company_has_permission(company_id, 'automation.view')
);
create policy automation_flows_insert on public.automation_flows for insert with check (
  public.company_has_permission(company_id, 'automation.create')
);
create policy automation_flows_update on public.automation_flows for update
using (
  deleted_at is null
  and public.company_has_permission(company_id, 'automation.edit')
)
with check (
  public.company_has_permission(company_id, 'automation.edit')
);
create policy automation_flows_delete on public.automation_flows for delete using (
  public.company_has_permission(company_id, 'automation.delete')
);

-- automation_nodes (scoped via flow)
create policy automation_nodes_select on public.automation_nodes for select using (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_nodes.flow_id
      and f.deleted_at is null
      and public.company_has_permission(f.company_id, 'automation.view')
  )
);
create policy automation_nodes_insert on public.automation_nodes for insert with check (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_nodes.flow_id
      and f.deleted_at is null
      and public.company_has_permission(f.company_id, 'automation.edit')
  )
);
create policy automation_nodes_update on public.automation_nodes for update
using (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_nodes.flow_id
      and f.deleted_at is null
      and public.company_has_permission(f.company_id, 'automation.edit')
  )
)
with check (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_nodes.flow_id
      and f.deleted_at is null
      and public.company_has_permission(f.company_id, 'automation.edit')
  )
);
create policy automation_nodes_delete on public.automation_nodes for delete using (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_nodes.flow_id
      and public.company_has_permission(f.company_id, 'automation.edit')
  )
);

-- automation_edges (scoped via flow)
create policy automation_edges_select on public.automation_edges for select using (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_edges.flow_id
      and f.deleted_at is null
      and public.company_has_permission(f.company_id, 'automation.view')
  )
);
create policy automation_edges_insert on public.automation_edges for insert with check (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_edges.flow_id
      and f.deleted_at is null
      and public.company_has_permission(f.company_id, 'automation.edit')
  )
);
create policy automation_edges_update on public.automation_edges for update
using (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_edges.flow_id
      and f.deleted_at is null
      and public.company_has_permission(f.company_id, 'automation.edit')
  )
)
with check (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_edges.flow_id
      and f.deleted_at is null
      and public.company_has_permission(f.company_id, 'automation.edit')
  )
);
create policy automation_edges_delete on public.automation_edges for delete using (
  exists (
    select 1 from public.automation_flows f
    where f.id = automation_edges.flow_id
      and public.company_has_permission(f.company_id, 'automation.edit')
  )
);

-- automation_runs
create policy automation_runs_select on public.automation_runs for select using (
  public.company_has_permission(company_id, 'automation.view')
);
create policy automation_runs_insert on public.automation_runs for insert with check (
  public.company_has_permission(company_id, 'automation.execute')
);
create policy automation_runs_update on public.automation_runs for update
using (public.company_has_permission(company_id, 'automation.execute'))
with check (public.company_has_permission(company_id, 'automation.execute'));

-- conversation_sessions
create policy conversation_sessions_select on public.conversation_sessions for select using (
  public.company_has_permission(company_id, 'automation.view')
);
create policy conversation_sessions_insert on public.conversation_sessions for insert with check (
  public.company_has_permission(company_id, 'automation.execute')
);
create policy conversation_sessions_update on public.conversation_sessions for update
using (public.company_has_permission(company_id, 'automation.execute'))
with check (public.company_has_permission(company_id, 'automation.execute'));

-- automation_session_messages (scoped via session)
create policy automation_session_messages_select on public.automation_session_messages for select using (
  exists (
    select 1 from public.conversation_sessions s
    where s.id = automation_session_messages.session_id
      and public.company_has_permission(s.company_id, 'automation.view')
  )
);
create policy automation_session_messages_insert on public.automation_session_messages for insert with check (
  exists (
    select 1 from public.conversation_sessions s
    where s.id = automation_session_messages.session_id
      and public.company_has_permission(s.company_id, 'automation.execute')
  )
);
