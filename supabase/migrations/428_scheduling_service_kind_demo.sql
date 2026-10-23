-- ============================================================
-- Slice C: Sales demo services vs operational clinic services
-- Additive only. Existing services default to operational.
-- ============================================================

-- Service product surface: operational (clinic) vs sales_demo
alter table public.scheduling_services
  add column if not exists service_kind text not null default 'operational';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scheduling_services_service_kind_check'
      and conrelid = 'public.scheduling_services'::regclass
  ) then
    alter table public.scheduling_services
      add constraint scheduling_services_service_kind_check
      check (service_kind in ('operational', 'sales_demo'));
  end if;
end $$;

-- Ensure legacy rows remain operational (explicit backfill for safety)
update public.scheduling_services
set service_kind = 'operational'
where service_kind is null
   or btrim(service_kind) = ''
   or service_kind not in ('operational', 'sales_demo');

create index if not exists idx_scheduling_services_company_kind
  on public.scheduling_services(company_id, service_kind)
  where deleted_at is null;

comment on column public.scheduling_services.service_kind is
  'operational = clinic/service appointments; sales_demo = product demo bookings. Same scheduling engine, separate catalogs.';

-- Create-request idempotency for AI/demo retries (nullable; clinic path may omit)
alter table public.scheduling_bookings
  add column if not exists client_request_id text;

create unique index if not exists idx_scheduling_bookings_company_client_request_id
  on public.scheduling_bookings(company_id, client_request_id)
  where client_request_id is not null
    and btrim(client_request_id) <> ''
    and deleted_at is null;

comment on column public.scheduling_bookings.client_request_id is
  'Optional client idempotency key (e.g. AI create_demo_booking). Unique per company when set.';
