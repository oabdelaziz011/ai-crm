-- Documentation / existence assertions for OOB-applied migrations 320b, 321b, 322a, 322b, 324.
-- Does NOT mutate business data, sequences, policies, functions, or workflow clones.

comment on policy ai_employees_update_active on public.ai_employees is
  'OOB-applied (320b): edit in-place updates for non-deleted AI employees.';
comment on policy ai_employees_soft_delete on public.ai_employees is
  'OOB-applied (320b): archive soft-delete sets deleted_at + status=archived.';
comment on policy ai_employees_restore on public.ai_employees is
  'OOB-applied (320b): restore archived AI employees to draft.';

comment on function public.archive_ai_employee(uuid, uuid) is
  'OOB-applied (321b): soft-delete AI employee; requires agents.delete.';
comment on function public.restore_ai_employee(uuid, uuid) is
  'OOB-applied (321b): restore archived AI employee to draft; requires agents.edit.';

comment on index public.uq_automation_flows_one_time_clone_key is
  'OOB-applied (322a): one-time workflow clone idempotency per company.';
comment on function public.provision_rahla_kamila_workflow_v1(uuid) is
  'OOB-applied (322a): one-time deep clone of platform «رحلة كاملة»; no live template sync.';

comment on index public.idx_scheduling_bookings_company_confirmation_number_active is
  'OOB-applied (322b): partial unique confirmation numbers for active bookings.';
comment on function public.assign_scheduling_booking_confirmation_number() is
  'OOB-applied (322b): sequential BK-###### generation with production floor < 900.';

comment on function public.backfill_rahla_kamila_workflows_v1(uuid) is
  'OOB-applied (324): idempotent backfill helper; NOT auto-invoked by this migration.';

do $$
begin
  if not exists (
    select 1 from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ai_employees'
      and pol.polname in ('ai_employees_update_active', 'ai_employees_soft_delete', 'ai_employees_restore')
  ) then
    raise exception '331 assertion failed: 320b AI employee policies missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('archive_ai_employee', 'restore_ai_employee')
  ) then
    raise exception '331 assertion failed: 321b archive/restore functions missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'uq_automation_flows_one_time_clone_key'
  ) then
    raise exception '331 assertion failed: 322a one_time_clone_key index missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'provision_rahla_kamila_workflow_v1'
  ) then
    raise exception '331 assertion failed: 322a provision function missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_scheduling_bookings_company_confirmation_number_active'
  ) then
    raise exception '331 assertion failed: 322b active confirmation index missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'assign_scheduling_booking_confirmation_number'
  ) then
    raise exception '331 assertion failed: 322b confirmation trigger function missing';
  end if;

  if not exists (
    select 1 from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and pol.polname = 'avatars_storage_select_own'
  ) then
    raise exception '331 assertion failed: 330 avatars_storage_select_own policy missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'backfill_rahla_kamila_workflows_v1'
  ) then
    raise exception '331 assertion failed: 324 backfill function missing';
  end if;
end;
$$;
