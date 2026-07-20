-- ============================================================
-- Vault OS – Sprint B1-02: Automation execution runtime
-- Extends runs/sessions for engine state persistence.
-- ============================================================

alter table public.automation_runs
  drop constraint if exists automation_runs_status_check;

alter table public.automation_runs
  add constraint automation_runs_status_check
  check (status in ('pending', 'queued', 'running', 'waiting_input', 'completed', 'failed', 'cancelled'));

alter table public.automation_runs
  add column if not exists current_node_id uuid references public.automation_nodes(id) on delete set null,
  add column if not exists session_id uuid,
  add column if not exists variables jsonb not null default '{}'::jsonb;

alter table public.conversation_sessions
  drop constraint if exists conversation_sessions_status_check;

alter table public.conversation_sessions
  add constraint conversation_sessions_status_check
  check (status in ('active', 'running', 'waiting_input', 'paused', 'completed', 'expired', 'cancelled'));

alter table public.conversation_sessions
  add column if not exists run_id uuid references public.automation_runs(id) on delete set null,
  add column if not exists variables jsonb not null default '{}'::jsonb;

alter table public.automation_runs
  drop constraint if exists automation_runs_session_id_fkey;

alter table public.automation_runs
  add constraint automation_runs_session_id_fkey
  foreign key (session_id) references public.conversation_sessions(id) on delete set null;

create index if not exists idx_automation_runs_session_id
  on public.automation_runs(session_id)
  where session_id is not null;

create index if not exists idx_automation_runs_waiting
  on public.automation_runs(company_id, status)
  where status = 'waiting_input';

create index if not exists idx_conversation_sessions_run_id
  on public.conversation_sessions(run_id)
  where run_id is not null;

create index if not exists idx_conversation_sessions_waiting
  on public.conversation_sessions(company_id, status)
  where status = 'waiting_input';

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
    elsif p_new.status = 'waiting_input' then
      return jsonb_build_array('run_waiting_input');
    end if;
  end if;

  return '[]'::jsonb;
end;
$$;

insert into public.permissions (code, category, module, action, description)
values
  ('automation.execute', 'Automation', 'Automation', 'Execute', 'Execute automation flows and sessions')
on conflict (code) do nothing;
