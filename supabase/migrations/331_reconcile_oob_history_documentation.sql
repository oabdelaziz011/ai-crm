-- Documentation / existence assertions for OOB-applied migrations 320b, 321b, 322a, 322b, 324.
-- Does NOT mutate business data, sequences, policies, functions, or workflow clones.
--
-- OOB-only objects (archived under _archived_oob/) are documented when present and
-- skipped on clean active-chain replay. Active-chain objects remain hard-asserted.

-- ── OOB-only: comment if present (320b policies) ───────────────

do $$
begin
  if exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ai_employees'
      and pol.polname = 'ai_employees_update_active'
  ) then
    execute $c$
      comment on policy ai_employees_update_active on public.ai_employees is
        'OOB-applied (320b): edit in-place updates for non-deleted AI employees.'
    $c$;
  else
    raise notice '331 skip: OOB policy public.ai_employees.ai_employees_update_active not present';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ai_employees'
      and pol.polname = 'ai_employees_soft_delete'
  ) then
    execute $c$
      comment on policy ai_employees_soft_delete on public.ai_employees is
        'OOB-applied (320b): archive soft-delete sets deleted_at + status=archived.'
    $c$;
  else
    raise notice '331 skip: OOB policy public.ai_employees.ai_employees_soft_delete not present';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ai_employees'
      and pol.polname = 'ai_employees_restore'
  ) then
    execute $c$
      comment on policy ai_employees_restore on public.ai_employees is
        'OOB-applied (320b): restore archived AI employees to draft.'
    $c$;
  else
    raise notice '331 skip: OOB policy public.ai_employees.ai_employees_restore not present';
  end if;
end;
$$;

-- ── OOB-only: comment if present (321b / 322a / 322b / 324) ─────

do $$
begin
  if to_regprocedure('public.archive_ai_employee(uuid,uuid)') is not null then
    execute $c$
      comment on function public.archive_ai_employee(uuid, uuid) is
        'OOB-applied (321b): soft-delete AI employee; requires agents.delete.'
    $c$;
  else
    raise notice '331 skip: OOB function public.archive_ai_employee(uuid,uuid) not present';
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.restore_ai_employee(uuid,uuid)') is not null then
    execute $c$
      comment on function public.restore_ai_employee(uuid, uuid) is
        'OOB-applied (321b): restore archived AI employee to draft; requires agents.edit.'
    $c$;
  else
    raise notice '331 skip: OOB function public.restore_ai_employee(uuid,uuid) not present';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.uq_automation_flows_one_time_clone_key') is not null then
    execute $c$
      comment on index public.uq_automation_flows_one_time_clone_key is
        'OOB-applied (322a): one-time workflow clone idempotency per company.'
    $c$;
  else
    raise notice '331 skip: OOB index public.uq_automation_flows_one_time_clone_key not present';
  end if;
end;
$$;

do $$
begin
  if to_regprocedure('public.provision_rahla_kamila_workflow_v1(uuid)') is not null then
    execute $c$
      comment on function public.provision_rahla_kamila_workflow_v1(uuid) is
        'OOB-applied (322a): one-time deep clone of platform «رحلة كاملة»; no live template sync.'
    $c$;
  else
    raise notice '331 skip: OOB function public.provision_rahla_kamila_workflow_v1(uuid) not present';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.idx_scheduling_bookings_company_confirmation_number_active') is not null then
    execute $c$
      comment on index public.idx_scheduling_bookings_company_confirmation_number_active is
        'OOB-applied (322b): partial unique confirmation numbers for active bookings.'
    $c$;
  else
    raise notice '331 skip: OOB index public.idx_scheduling_bookings_company_confirmation_number_active not present';
  end if;
end;
$$;

-- Active-chain function (256/282/319): unconditional documentation comment
comment on function public.assign_scheduling_booking_confirmation_number() is
  'OOB-applied (322b): sequential BK-###### generation with production floor < 900.';

do $$
begin
  if to_regprocedure('public.backfill_rahla_kamila_workflows_v1(uuid)') is not null then
    execute $c$
      comment on function public.backfill_rahla_kamila_workflows_v1(uuid) is
        'OOB-applied (324): idempotent backfill helper; NOT auto-invoked by this migration.'
    $c$;
  else
    raise notice '331 skip: OOB function public.backfill_rahla_kamila_workflows_v1(uuid) not present';
  end if;
end;
$$;

-- ── Assertions ─────────────────────────────────────────────────

do $$
begin
  -- OOB-only: soft-skip on clean active-chain replay
  if not exists (
    select 1 from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ai_employees'
      and pol.polname in ('ai_employees_update_active', 'ai_employees_soft_delete', 'ai_employees_restore')
  ) then
    raise notice '331 soft-skip: 320b AI employee policies missing (OOB-only; not required for clean replay)';
  end if;

  if to_regprocedure('public.archive_ai_employee(uuid,uuid)') is null
     or to_regprocedure('public.restore_ai_employee(uuid,uuid)') is null then
    raise notice '331 soft-skip: 321b archive/restore functions missing (OOB-only; not required for clean replay)';
  end if;

  if to_regclass('public.uq_automation_flows_one_time_clone_key') is null then
    raise notice '331 soft-skip: 322a one_time_clone_key index missing (OOB-only; not required for clean replay)';
  end if;

  if to_regprocedure('public.provision_rahla_kamila_workflow_v1(uuid)') is null then
    raise notice '331 soft-skip: 322a provision function missing (OOB-only; not required for clean replay)';
  end if;

  if to_regclass('public.idx_scheduling_bookings_company_confirmation_number_active') is null then
    raise notice '331 soft-skip: 322b active confirmation index missing (OOB-only; not required for clean replay)';
  end if;

  if to_regprocedure('public.backfill_rahla_kamila_workflows_v1(uuid)') is null then
    raise notice '331 soft-skip: 324 backfill function missing (OOB-only; not required for clean replay)';
  end if;

  -- Active-chain: hard-require
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'assign_scheduling_booking_confirmation_number'
      and pg_get_function_identity_arguments(p.oid) = ''
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
end;
$$;
