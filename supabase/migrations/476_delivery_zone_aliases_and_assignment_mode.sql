-- Zone aliases for bilingual AI matching + delivery assignment mode (manual | ai).

alter table public.company_delivery_zones
  add column if not exists aliases text[] not null default '{}'::text[];

comment on column public.company_delivery_zones.aliases is
  'Alternate spellings (Arabic/English) for AI zone matching; canonical zone_name stays unique.';

alter table public.company_order_settings
  add column if not exists delivery_assignment_mode text not null default 'manual';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_order_settings_delivery_assignment_mode_chk'
  ) then
    alter table public.company_order_settings
      add constraint company_order_settings_delivery_assignment_mode_chk
      check (delivery_assignment_mode in ('manual', 'ai'));
  end if;
end $$;

comment on column public.company_order_settings.delivery_assignment_mode is
  'manual = human assigns from sales order details; ai = auto-assign active worker for the zone after confirmation.';
