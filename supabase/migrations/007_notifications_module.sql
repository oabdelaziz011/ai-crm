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
