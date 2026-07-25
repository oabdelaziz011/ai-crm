-- S4.4: Slot interval for discrete slot generation stepping
alter table public.scheduling_booking_rules
  add column if not exists slot_interval_minutes integer not null default 15
    check (slot_interval_minutes > 0 and slot_interval_minutes <= 480);

comment on column public.scheduling_booking_rules.slot_interval_minutes is
  'Minutes between candidate slot start times when generating bookable slots.';
