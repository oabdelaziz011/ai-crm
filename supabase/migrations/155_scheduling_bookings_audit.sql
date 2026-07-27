-- S6.7: Audit trail for scheduling_bookings lifecycle changes

drop trigger if exists trg_audit_scheduling_bookings on public.scheduling_bookings;
create trigger trg_audit_scheduling_bookings
  after insert or update or delete on public.scheduling_bookings
  for each row execute procedure public.write_audit_log();

comment on trigger trg_audit_scheduling_bookings on public.scheduling_bookings is
  'Writes scheduling booking lifecycle changes to audit_logs.';
