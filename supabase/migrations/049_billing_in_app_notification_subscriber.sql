-- ============================================================
-- Vault OS – Billing Phase B: in-app notification subscriber
-- Architecture: enterprise-billing-platform-v2.1 §4 (Notification Bus)
-- Inline subscriber: billing_notification_events → notifications
-- Additive only; idempotent.
-- ============================================================

create or replace function public.billing_notification_in_app_subscriber()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_type text := 'info';
  v_title_key text := 'notifications.events.billing.generic.title';
  v_message jsonb;
begin
  if not ('in_app' = any(coalesce(new.channels, array[]::text[]))) then
    return new;
  end if;

  if new.company_id is null then
    return new;
  end if;

  select c.label into v_label
  from public.billing_event_catalog c
  where c.code = new.event_code;

  v_label := coalesce(v_label, new.event_code);

  if new.event_code like '%.failed' or new.event_code like '%.expired' or new.event_code like '%.suspended' then
    v_type := 'warning';
  elsif new.event_code like '%.degraded' then
    v_type := 'error';
  elsif new.event_code like '%.succeeded' or new.event_code like '%.paid' or new.event_code like '%.restored' then
    v_type := 'success';
  end if;

  v_message := jsonb_build_object(
    'messageKey', 'notifications.events.billing.generic.message',
    'params', jsonb_build_object(
      'eventLabel', v_label,
      'detail', coalesce(new.payload->>'detail', new.payload->>'message', '')
    )
  );

  insert into public.notifications (
    company_id, user_id, title, message, type, category
  )
  values (
    new.company_id,
    new.user_id,
    v_title_key,
    v_message::text,
    v_type,
    'subscription'
  );

  if coalesce(new.channels, array[]::text[]) <@ array['in_app']::text[] then
    update public.billing_notification_events
    set status = 'completed', processed_at = now()
    where id = new.id and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_billing_notification_in_app_subscriber on public.billing_notification_events;
create trigger trg_billing_notification_in_app_subscriber
  after insert on public.billing_notification_events
  for each row
  execute function public.billing_notification_in_app_subscriber();
