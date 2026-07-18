-- ============================================================
-- Vault OS – Notifications
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  message text not null,
  type text not null check (type in ('success', 'warning', 'error', 'info')),
  category text not null check (category in ('booking', 'invoice', 'subscription', 'whatsapp', 'system')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists company_id uuid,
  add column if not exists user_id uuid,
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists type text,
  add column if not exists category text,
  add column if not exists is_read boolean default false,
  add column if not exists created_at timestamptz default now();

update public.notifications
set is_read = false
where is_read is null;

update public.notifications
set created_at = now()
where created_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_company_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_company_id_fkey
      foreign key (company_id)
      references public.companies(id)
      on delete cascade;
  end if;
exception
  when others then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_user_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete set null;
  end if;
exception
  when others then null;
end $$;

create index if not exists idx_notifications_company_created_at
  on public.notifications(company_id, created_at desc);

create index if not exists idx_notifications_company_is_read
  on public.notifications(company_id, is_read);

create index if not exists idx_notifications_user_id
  on public.notifications(user_id);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_company on public.notifications;
create policy notifications_select_company
  on public.notifications for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists notifications_update_company on public.notifications;
create policy notifications_update_company
  on public.notifications for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists notifications_delete_company on public.notifications;
create policy notifications_delete_company
  on public.notifications for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists notifications_insert_admins on public.notifications;
create policy notifications_insert_admins
  on public.notifications for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
