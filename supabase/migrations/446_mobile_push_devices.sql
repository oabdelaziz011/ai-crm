-- Local mobile device registry. Tokens belong to the authenticated user and
-- the server-resolved company. Delivery credentials are not stored here.
-- Rows are revoked rather than deleted so a later audit can see the device.

create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'unknown')),
  device_name text,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mobile_push_devices_user_company_token
  on public.mobile_push_devices (user_id, company_id, expo_push_token);

create unique index if not exists mobile_push_devices_one_active_token
  on public.mobile_push_devices (expo_push_token)
  where revoked_at is null;

alter table public.mobile_push_devices enable row level security;

drop policy if exists mobile_push_devices_select on public.mobile_push_devices;
create policy mobile_push_devices_select
  on public.mobile_push_devices
  for select
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id());

drop policy if exists mobile_push_devices_insert on public.mobile_push_devices;
create policy mobile_push_devices_insert
  on public.mobile_push_devices
  for insert
  to authenticated
  with check (user_id = auth.uid() and company_id = public.current_company_id());

drop policy if exists mobile_push_devices_update on public.mobile_push_devices;
create policy mobile_push_devices_update
  on public.mobile_push_devices
  for update
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id())
  with check (user_id = auth.uid() and company_id = public.current_company_id());

revoke all on public.mobile_push_devices from public;
revoke all on public.mobile_push_devices from anon;
grant select, insert, update on public.mobile_push_devices to authenticated;
grant select, insert, update on public.mobile_push_devices to service_role;
