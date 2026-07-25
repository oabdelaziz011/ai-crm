-- ============================================================
-- Sprint W1: Channel Platform ↔ Automation Workflow bindings
-- Maps a company channel to an automation flow for inbound routing.
-- ============================================================

create table if not exists public.company_channel_automation_bindings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_channel_id uuid not null references public.company_channels(id) on delete cascade,
  automation_flow_id uuid not null references public.automation_flows(id) on delete restrict,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint company_channel_automation_bindings_unique_channel unique (company_channel_id)
);

create index if not exists idx_company_channel_automation_bindings_company
  on public.company_channel_automation_bindings(company_id)
  where deleted_at is null;

create index if not exists idx_company_channel_automation_bindings_flow
  on public.company_channel_automation_bindings(automation_flow_id)
  where deleted_at is null;

drop trigger if exists company_channel_automation_bindings_updated_at on public.company_channel_automation_bindings;
create trigger company_channel_automation_bindings_updated_at
  before update on public.company_channel_automation_bindings
  for each row execute procedure public.set_updated_at();

alter table public.company_channel_automation_bindings enable row level security;

drop policy if exists company_channel_automation_bindings_select on public.company_channel_automation_bindings;
create policy company_channel_automation_bindings_select
  on public.company_channel_automation_bindings for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists company_channel_automation_bindings_insert on public.company_channel_automation_bindings;
create policy company_channel_automation_bindings_insert
  on public.company_channel_automation_bindings for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.company_has_permission(company_id, 'channels.manage')
      )
    )
  );

drop policy if exists company_channel_automation_bindings_update on public.company_channel_automation_bindings;
create policy company_channel_automation_bindings_update
  on public.company_channel_automation_bindings for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.company_has_permission(company_id, 'channels.manage')
      )
    )
  );

drop policy if exists company_channel_automation_bindings_delete on public.company_channel_automation_bindings;
create policy company_channel_automation_bindings_delete
  on public.company_channel_automation_bindings for delete
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.company_has_permission(company_id, 'channels.manage')
      )
    )
  );
