-- ============================================================
-- Vault OS – Production schema reconciliation (companies)
-- Restores public.companies to repository state (003 + 032)
-- after manual / dashboard drift on the linked Supabase project.
-- Does not redesign schema; idempotent where possible.
-- ============================================================

-- ── 1. Normalize existing row data ─────────────────────────

update public.companies
set status = case lower(trim(status))
  when 'active' then 'Active'
  when 'suspended' then 'Suspended'
  when 'trial' then 'Trial'
  else status
end
where status is not null
  and status not in ('Active', 'Suspended', 'Trial');

update public.companies
set subscription_status = lower(trim(subscription_status))
where subscription_status is not null
  and subscription_status <> lower(trim(subscription_status));

update public.companies
set subscription_status = 'trialing'
where subscription_status is null
   or subscription_status not in (
     'active', 'trialing', 'past_due', 'grace_period', 'canceled', 'expired'
   );

update public.companies
set status = 'Trial'
where status is null;

update public.companies
set billing_cycle = 'monthly'
where billing_cycle is null
   or billing_cycle not in ('monthly', 'yearly');

update public.companies
set subscription_plan = 'Basic'
where subscription_plan is null
   or trim(subscription_plan) = '';

update public.companies
set created_at = now()
where created_at is null;

update public.companies
set updated_at = now()
where updated_at is null;

-- ── 2. Restore column defaults (003 + 032) ───────────────────

alter table public.companies
  alter column status set default 'Trial';

alter table public.companies
  alter column subscription_plan set default 'Basic';

alter table public.companies
  alter column subscription_status set default 'trialing';

alter table public.companies
  alter column billing_cycle set default 'monthly';

alter table public.companies
  alter column created_at set default now();

alter table public.companies
  alter column updated_at set default now();

-- ── 3. Restore NOT NULL (003) ────────────────────────────────

alter table public.companies
  alter column status set not null;

alter table public.companies
  alter column subscription_status set not null;

alter table public.companies
  alter column billing_cycle set not null;

alter table public.companies
  alter column created_at set not null;

alter table public.companies
  alter column updated_at set not null;

-- ── 4. Restore CHECK constraints (003 + 032) ─────────────────

alter table public.companies
  drop constraint if exists companies_status_check;

alter table public.companies
  add constraint companies_status_check
  check (status in ('Active', 'Suspended', 'Trial'));

alter table public.companies
  drop constraint if exists companies_billing_cycle_check;

alter table public.companies
  add constraint companies_billing_cycle_check
  check (billing_cycle in ('monthly', 'yearly'));

alter table public.companies
  drop constraint if exists companies_subscription_status_check;

alter table public.companies
  add constraint companies_subscription_status_check
  check (subscription_status in (
    'active', 'trialing', 'past_due', 'grace_period', 'canceled', 'expired'
  ));

-- ── 5. Ensure indexes (003 + 005) ────────────────────────────

create index if not exists idx_companies_status
  on public.companies(status);

create index if not exists idx_companies_subscription_status
  on public.companies(subscription_status);

create index if not exists idx_companies_billing_cycle
  on public.companies(billing_cycle);

create index if not exists idx_companies_subscription_expires_at
  on public.companies(subscription_expires_at);

create index if not exists idx_companies_plan_id
  on public.companies(plan_id);

-- ── 6. Ensure FK (005) ───────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_plan_id_fkey'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_plan_id_fkey
      foreign key (plan_id)
      references public.plans(id);
  end if;
end $$;

-- ── 7. Ensure triggers (003 + 006 + 008) ─────────────────────

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at
  before update on public.companies
  for each row execute procedure public.set_updated_at();

drop trigger if exists trg_audit_companies on public.companies;
create trigger trg_audit_companies
  after insert or update or delete on public.companies
  for each row execute procedure public.write_audit_log();

drop trigger if exists trg_notify_subscription_events on public.companies;
create trigger trg_notify_subscription_events
  after insert or update on public.companies
  for each row execute procedure public.notify_subscription_events();

-- ── 8. Ensure RLS + policies (003) ───────────────────────────

alter table public.companies enable row level security;

drop policy if exists companies_super_admin_select on public.companies;
create policy companies_super_admin_select
  on public.companies for select
  using (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists companies_super_admin_insert on public.companies;
create policy companies_super_admin_insert
  on public.companies for insert
  with check (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists companies_super_admin_update on public.companies;
create policy companies_super_admin_update
  on public.companies for update
  using (auth.role() = 'authenticated' and public.is_super_admin())
  with check (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists companies_super_admin_delete on public.companies;
create policy companies_super_admin_delete
  on public.companies for delete
  using (auth.role() = 'authenticated' and public.is_super_admin());

drop policy if exists companies_member_select on public.companies;
create policy companies_member_select
  on public.companies for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.profiles p
      where (p.id = auth.uid() or p.user_id = auth.uid())
        and p.company_id = companies.id
    )
  );
