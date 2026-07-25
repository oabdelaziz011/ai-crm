-- ============================================================
-- Vault OS – Automation version graph materialization
-- Decouples runtime execution state from mutable draft nodes.
-- ============================================================

-- ── Immutable published node graph (materialized from snapshots) ──

create table if not exists public.automation_flow_version_nodes (
  flow_version_id uuid not null references public.automation_flow_versions(id) on delete cascade,
  id uuid not null,
  flow_id uuid not null references public.automation_flows(id) on delete cascade,
  type text not null,
  config jsonb not null default '{}'::jsonb,
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (flow_version_id, id)
);

create index if not exists idx_automation_flow_version_nodes_flow_id
  on public.automation_flow_version_nodes(flow_id);

create table if not exists public.automation_flow_version_edges (
  flow_version_id uuid not null references public.automation_flow_versions(id) on delete cascade,
  id text not null,
  flow_id uuid not null references public.automation_flows(id) on delete cascade,
  source_node_id uuid not null,
  target_node_id uuid not null,
  condition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (flow_version_id, id),
  constraint automation_flow_version_edges_source_fkey
    foreign key (flow_version_id, source_node_id)
    references public.automation_flow_version_nodes(flow_version_id, id)
    on delete cascade,
  constraint automation_flow_version_edges_target_fkey
    foreign key (flow_version_id, target_node_id)
    references public.automation_flow_version_nodes(flow_version_id, id)
    on delete cascade
);

create index if not exists idx_automation_flow_version_edges_flow_id
  on public.automation_flow_version_edges(flow_id);

-- ── Pin runtime state to a published version ───────────────────

alter table public.automation_runs
  add column if not exists flow_version_id uuid references public.automation_flow_versions(id) on delete set null;

alter table public.conversation_sessions
  add column if not exists flow_version_id uuid references public.automation_flow_versions(id) on delete set null;

create index if not exists idx_automation_runs_flow_version_id
  on public.automation_runs(flow_version_id);

create index if not exists idx_conversation_sessions_flow_version_id
  on public.conversation_sessions(flow_version_id);

-- ── Backfill version graph from existing published snapshots ───

insert into public.automation_flow_version_nodes (flow_version_id, id, flow_id, type, config, position_x, position_y)
select
  v.id,
  (node->>'id')::uuid,
  v.flow_id,
  node->>'type',
  coalesce(node->'config', '{}'::jsonb),
  coalesce((node->>'positionX')::numeric, 0),
  coalesce((node->>'positionY')::numeric, 0)
from public.automation_flow_versions v
cross join lateral jsonb_array_elements(coalesce(v.snapshot->'nodes', '[]'::jsonb)) as node
where node->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (flow_version_id, id) do nothing;

insert into public.automation_flow_version_edges (flow_version_id, id, flow_id, source_node_id, target_node_id, condition)
select
  v.id,
  edge->>'id',
  v.flow_id,
  (edge->>'sourceNodeId')::uuid,
  (edge->>'targetNodeId')::uuid,
  coalesce(edge->'condition', '{}'::jsonb)
from public.automation_flow_versions v
cross join lateral jsonb_array_elements(coalesce(v.snapshot->'edges', '[]'::jsonb)) as edge
where edge->>'sourceNodeId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and edge->>'targetNodeId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.automation_flow_version_nodes source_node
    where source_node.flow_version_id = v.id
      and source_node.id = (edge->>'sourceNodeId')::uuid
  )
  and exists (
    select 1
    from public.automation_flow_version_nodes target_node
    where target_node.flow_version_id = v.id
      and target_node.id = (edge->>'targetNodeId')::uuid
  )
on conflict (flow_version_id, id) do nothing;

-- Backfill flow_version_id on runs
update public.automation_runs r
set flow_version_id = (r.metadata->>'flowVersionId')::uuid
where r.flow_version_id is null
  and r.metadata->>'flowVersionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.automation_flow_versions v
    where v.id = (r.metadata->>'flowVersionId')::uuid
  );

update public.automation_runs r
set flow_version_id = f.active_version_id
from public.automation_flows f
where r.flow_id = f.id
  and r.flow_version_id is null
  and f.active_version_id is not null;

-- Backfill flow_version_id on sessions
update public.conversation_sessions s
set flow_version_id = r.flow_version_id
from public.automation_runs r
where s.run_id = r.id
  and s.flow_version_id is null
  and r.flow_version_id is not null;

update public.conversation_sessions s
set flow_version_id = f.active_version_id
from public.automation_flows f
where s.flow_id = f.id
  and s.flow_version_id is null
  and f.active_version_id is not null;

-- ── Repoint runtime node FKs from draft nodes to version nodes ─

alter table public.conversation_sessions
  drop constraint if exists conversation_sessions_current_node_id_fkey;

alter table public.automation_runs
  drop constraint if exists automation_runs_current_node_id_fkey;

alter table public.conversation_sessions
  drop constraint if exists conversation_sessions_version_node_fkey;

alter table public.automation_runs
  drop constraint if exists automation_runs_version_node_fkey;

alter table public.conversation_sessions
  add constraint conversation_sessions_version_node_fkey
  foreign key (flow_version_id, current_node_id)
  references public.automation_flow_version_nodes(flow_version_id, id)
  on delete set null;

alter table public.automation_runs
  add constraint automation_runs_version_node_fkey
  foreign key (flow_version_id, current_node_id)
  references public.automation_flow_version_nodes(flow_version_id, id)
  on delete set null;

-- ── RLS (mirror automation_flow_versions access) ─────────────

alter table public.automation_flow_version_nodes enable row level security;
alter table public.automation_flow_version_edges enable row level security;

drop policy if exists automation_flow_version_nodes_select on public.automation_flow_version_nodes;
create policy automation_flow_version_nodes_select on public.automation_flow_version_nodes
  for select using (
    exists (
      select 1
      from public.automation_flow_versions v
      where v.id = flow_version_id
        and public.company_has_permission(v.company_id, 'automation.view')
    )
  );

drop policy if exists automation_flow_version_nodes_insert on public.automation_flow_version_nodes;
create policy automation_flow_version_nodes_insert on public.automation_flow_version_nodes
  for insert with check (
    exists (
      select 1
      from public.automation_flow_versions v
      where v.id = flow_version_id
        and public.company_has_permission(v.company_id, 'automation.publish')
    )
  );

drop policy if exists automation_flow_version_edges_select on public.automation_flow_version_edges;
create policy automation_flow_version_edges_select on public.automation_flow_version_edges
  for select using (
    exists (
      select 1
      from public.automation_flow_versions v
      where v.id = flow_version_id
        and public.company_has_permission(v.company_id, 'automation.view')
    )
  );

drop policy if exists automation_flow_version_edges_insert on public.automation_flow_version_edges;
create policy automation_flow_version_edges_insert on public.automation_flow_version_edges
  for insert with check (
    exists (
      select 1
      from public.automation_flow_versions v
      where v.id = flow_version_id
        and public.company_has_permission(v.company_id, 'automation.publish')
    )
  );
