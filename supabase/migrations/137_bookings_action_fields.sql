-- Extend bookings with first-class CRM action fields for workflow Create Booking node.

alter table public.bookings
  add column if not exists doctor_id text,
  add column if not exists location_id text,
  add column if not exists duration_minutes integer,
  add column if not exists notes text;

alter table public.bookings
  drop constraint if exists bookings_duration_minutes_positive;

alter table public.bookings
  add constraint bookings_duration_minutes_positive
  check (duration_minutes is null or duration_minutes > 0);
