-- S6.6: Add checked_in booking status for Operations Center check-in workflow

alter table public.scheduling_bookings
  drop constraint if exists scheduling_bookings_status_check;

alter table public.scheduling_bookings
  add constraint scheduling_bookings_status_check
  check (status in (
    'pending',
    'confirmed',
    'checked_in',
    'completed',
    'cancelled',
    'no_show',
    'rescheduled'
  ));

drop index if exists public.idx_scheduling_bookings_active_resource_range;

create index if not exists idx_scheduling_bookings_active_resource_range
  on public.scheduling_bookings (resource_id, start_at, end_at)
  where deleted_at is null
    and status in ('pending', 'confirmed', 'checked_in');

comment on column public.scheduling_bookings.status is
  'Booking lifecycle status including checked_in for front-desk arrival tracking.';
