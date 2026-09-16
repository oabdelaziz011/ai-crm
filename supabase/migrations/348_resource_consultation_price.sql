-- Restored local source mirror for remote-applied migration 348.
-- Remote history: version=348, name=resource_consultation_price
-- Live schema already has public.scheduling_resources.consultation_price_cents.
-- Idempotent: safe if re-run on a DB that already has the column.

alter table public.scheduling_resources
  add column if not exists consultation_price_cents bigint;

comment on column public.scheduling_resources.consultation_price_cents is
  'Optional consultation price in minor units (cents); introduced by migration 348.';
