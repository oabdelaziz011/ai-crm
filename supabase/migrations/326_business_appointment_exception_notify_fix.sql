-- Clarify business-exception notification states: queued vs sent vs failed.
-- Add queue linkage + parent queued counter + concurrent claim uniqueness.

alter table public.business_appointment_exceptions
  add column if not exists notification_queued_count integer not null default 0;

alter table public.business_appointment_exception_items
  add column if not exists notification_queue_id uuid;

alter table public.business_appointment_exception_items
  drop constraint if exists business_appointment_exception_items_notification_status_check;

alter table public.business_appointment_exception_items
  add constraint business_appointment_exception_items_notification_status_check
  check (notification_status in ('pending', 'queued', 'sent', 'failed', 'skipped'));

-- Only one active claim/cancel tracking row per booking per company (skipped may still insert skipped).
create unique index if not exists business_appointment_exception_items_active_booking_uidx
  on public.business_appointment_exception_items (company_id, booking_id)
  where cancellation_status in ('pending', 'cancelled');

comment on column public.business_appointment_exception_items.notification_queue_id is
  'notification_queue.id created for the WhatsApp outbound item; provider_message_id is Meta wamid after submit.';
comment on column public.business_appointment_exceptions.notification_queued_count is
  'Count of WhatsApp notifications successfully enqueued (not yet Meta-accepted).';
