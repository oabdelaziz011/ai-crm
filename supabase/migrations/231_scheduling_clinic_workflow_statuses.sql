-- Clinic Operations Workflow: with_nurse, in_progress (with doctor), archived

alter table public.scheduling_bookings
  drop constraint if exists scheduling_bookings_status_check;

alter table public.scheduling_bookings
  add constraint scheduling_bookings_status_check
  check (status in (
    'pending',
    'confirmed',
    'checked_in',
    'with_nurse',
    'in_progress',
    'completed',
    'archived',
    'cancelled',
    'no_show',
    'rescheduled'
  ));

drop index if exists public.idx_scheduling_bookings_active_resource_range;

create index if not exists idx_scheduling_bookings_active_resource_range
  on public.scheduling_bookings (resource_id, start_at, end_at)
  where deleted_at is null
    and status in ('pending', 'confirmed', 'checked_in', 'with_nurse', 'in_progress');

comment on column public.scheduling_bookings.status is
  'Clinic booking lifecycle: pending/confirmed → checked_in → with_nurse → in_progress → completed → archived.';
