-- S4.x: Cancellation and rescheduling notice policies on booking rules
alter table public.scheduling_booking_rules
  add column if not exists min_cancellation_notice_minutes integer not null default 0
    check (min_cancellation_notice_minutes >= 0),
  add column if not exists min_reschedule_notice_minutes integer not null default 0
    check (min_reschedule_notice_minutes >= 0);

comment on column public.scheduling_booking_rules.min_cancellation_notice_minutes is
  'Minimum minutes before appointment start when customer cancellation is allowed. 0 = no restriction.';

comment on column public.scheduling_booking_rules.min_reschedule_notice_minutes is
  'Minimum minutes before appointment start when rescheduling is allowed. 0 = no restriction.';
