-- ============================================================
-- Post-migration validation for automation version graph
-- Run after 139 + 140. All checks should return zero rows / true.
-- ============================================================

-- 1) Every published version has materialized nodes matching snapshot count
select
  v.id as flow_version_id,
  v.flow_id,
  v.version_number,
  jsonb_array_length(coalesce(v.snapshot->'nodes', '[]'::jsonb)) as snapshot_node_count,
  count(n.id) as materialized_node_count
from public.automation_flow_versions v
left join public.automation_flow_version_nodes n on n.flow_version_id = v.id
group by v.id, v.flow_id, v.version_number, v.snapshot
having jsonb_array_length(coalesce(v.snapshot->'nodes', '[]'::jsonb)) <> count(n.id);

-- 2) Orphan runtime node references (runs)
select r.id, r.flow_id, r.flow_version_id, r.current_node_id, r.status
from public.automation_runs r
where r.current_node_id is not null
  and r.flow_version_id is not null
  and not exists (
    select 1 from public.automation_flow_version_nodes n
    where n.flow_version_id = r.flow_version_id and n.id = r.current_node_id
  );

-- 3) Orphan runtime node references (sessions)
select s.id, s.flow_id, s.flow_version_id, s.current_node_id, s.status
from public.conversation_sessions s
where s.current_node_id is not null
  and s.flow_version_id is not null
  and not exists (
    select 1 from public.automation_flow_version_nodes n
    where n.flow_version_id = s.flow_version_id and n.id = s.current_node_id
  );

-- 4) Active runs/sessions missing flow_version_id
select 'run' as kind, id, flow_id, status from public.automation_runs
where flow_version_id is null and status in ('pending', 'running', 'waiting_input')
union all
select 'session' as kind, id, flow_id, status from public.conversation_sessions
where flow_version_id is null and status in ('active', 'running', 'waiting_input', 'paused');

-- 5) current_node_id set without flow_version_id (constraint should prevent)
select 'run' as kind, id from public.automation_runs
where current_node_id is not null and flow_version_id is null
union all
select 'session' as kind, id from public.conversation_sessions
where current_node_id is not null and flow_version_id is null;

-- 6) Version graph edge integrity
select e.flow_version_id, e.id, e.source_node_id, e.target_node_id
from public.automation_flow_version_edges e
where not exists (
  select 1 from public.automation_flow_version_nodes n
  where n.flow_version_id = e.flow_version_id and n.id = e.source_node_id
) or not exists (
  select 1 from public.automation_flow_version_nodes n
  where n.flow_version_id = e.flow_version_id and n.id = e.target_node_id
);

-- 7) Summary (expect non-zero totals only when data exists)
select
  (select count(*) from public.automation_flow_version_nodes) as version_nodes,
  (select count(*) from public.automation_flow_version_edges) as version_edges,
  (select count(*) from public.automation_runs where flow_version_id is not null) as pinned_runs,
  (select count(*) from public.conversation_sessions where flow_version_id is not null) as pinned_sessions;
