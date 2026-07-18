-- ============================================================
-- Vault OS – Notification Automation
-- ============================================================

create or replace function public.company_id_for_user(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.id = p_user_id or p.user_id = p_user_id
  order by case when p.id = p_user_id then 0 else 1 end
  limit 1;
$$;

create or replace function public.insert_notification(
  p_company_id uuid,
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text,
  p_category text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company_id is null then
    return;
  end if;

  if p_type not in ('success', 'warning', 'error', 'info') then
    raise exception 'Unsupported notification type: %', p_type;
  end if;

  if p_category not in ('booking', 'invoice', 'subscription', 'whatsapp', 'system') then
    raise exception 'Unsupported notification category: %', p_category;
  end if;

  if exists (
    select 1
    from public.notifications n
    where n.company_id = p_company_id
      and coalesce(n.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and n.title = p_title
      and n.message = p_message
      and n.created_at > now() - interval '30 seconds'
  ) then
    return;
  end if;

  insert into public.notifications (
    company_id,
    user_id,
    title,
    message,
    type,
    category,
    is_read,
    created_at
  )
  values (
    p_company_id,
    p_user_id,
    p_title,
    p_message,
    p_type,
    p_category,
    false,
    now()
  );
end;
$$;

create or replace function public.notification_payload(
  p_message_key text,
  p_params jsonb default '{}'::jsonb
)
returns text
language sql
immutable
as $$
  select json_build_object(
    'messageKey', p_message_key,
    'params', coalesce(p_params, '{}'::jsonb)
  )::text;
$$;

create or replace function public.notify_customer_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.insert_notification(
    public.company_id_for_user(new.user_id),
    new.user_id,
    'notifications.events.newCustomer.title',
    public.notification_payload(
      'notifications.events.newCustomer.message',
      json_build_object('name', coalesce(new.name, ''))
    ),
    'success',
    'system'
  );
  return new;
end;
$$;

create or replace function public.notify_booking_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
begin
  v_user_id := coalesce(new.user_id, old.user_id);
  v_company_id := public.company_id_for_user(v_user_id);

  if tg_op = 'INSERT' then
    perform public.insert_notification(
      v_company_id,
      v_user_id,
      'notifications.events.newBooking.title',
      public.notification_payload(
        'notifications.events.newBooking.message',
        json_build_object('service', coalesce(new.service, ''))
      ),
      'info',
      'booking'
    );
  elsif tg_op = 'UPDATE'
    and lower(coalesce(old.status, '')) <> lower(coalesce(new.status, ''))
    and lower(coalesce(new.status, '')) = 'cancelled'
  then
    perform public.insert_notification(
      v_company_id,
      v_user_id,
      'notifications.events.bookingCancelled.title',
      public.notification_payload(
        'notifications.events.bookingCancelled.message',
        json_build_object('service', coalesce(new.service, ''))
      ),
      'warning',
      'booking'
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_invoice_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_new_status text;
  v_old_status text;
begin
  v_user_id := coalesce(new.user_id, old.user_id);
  v_company_id := public.company_id_for_user(v_user_id);
  v_new_status := lower(coalesce(new.status, ''));
  v_old_status := lower(coalesce(old.status, ''));

  if tg_op = 'UPDATE' and v_old_status <> v_new_status then
    if v_new_status = 'paid' then
      perform public.insert_notification(
        v_company_id,
        v_user_id,
        'notifications.events.invoicePaid.title',
        public.notification_payload(
          'notifications.events.invoicePaid.message',
          json_build_object('invoiceId', coalesce(new.id::text, ''))
        ),
        'success',
        'invoice'
      );
    elsif v_new_status = 'overdue' then
      perform public.insert_notification(
        v_company_id,
        v_user_id,
        'notifications.events.invoiceOverdue.title',
        public.notification_payload(
          'notifications.events.invoiceOverdue.message',
          json_build_object('invoiceId', coalesce(new.id::text, ''))
        ),
        'error',
        'invoice'
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.notify_subscription_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := current_date;
  v_expires date;
  v_was_expires date;
begin
  v_expires := case
    when new.subscription_expires_at is null then null
    else new.subscription_expires_at::date
  end;

  if tg_op = 'UPDATE' then
    v_was_expires := case
      when old.subscription_expires_at is null then null
      else old.subscription_expires_at::date
    end;
  end if;

  if tg_op = 'INSERT' or v_expires is distinct from v_was_expires then
    if v_expires = v_today + 5 then
      perform public.insert_notification(
        new.id,
        null,
        'notifications.events.subscriptionExpiresSoon.title',
        public.notification_payload(
          'notifications.events.subscriptionExpiresSoon.message',
          json_build_object(
            'companyName', coalesce(new.name, ''),
            'expiresOn', v_expires::text
          )
        ),
        'warning',
        'subscription'
      );
    end if;

    if v_expires is not null and v_expires <= v_today then
      perform public.insert_notification(
        new.id,
        null,
        'notifications.events.subscriptionExpired.title',
        public.notification_payload(
          'notifications.events.subscriptionExpired.message',
          json_build_object('companyName', coalesce(new.name, ''))
        ),
        'error',
        'subscription'
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.notify_profile_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid;
begin
  if tg_op = 'INSERT' then
    v_company_id := new.company_id;
    v_user_id := coalesce(new.id, new.user_id);
    perform public.insert_notification(
      v_company_id,
      v_user_id,
      'notifications.events.userCreated.title',
      public.notification_payload('notifications.events.userCreated.message'),
      'success',
      'system'
    );
    return new;
  elsif tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_user_id := coalesce(old.id, old.user_id);
    perform public.insert_notification(
      v_company_id,
      v_user_id,
      'notifications.events.userDeleted.title',
      public.notification_payload('notifications.events.userDeleted.message'),
      'warning',
      'system'
    );
    return old;
  end if;

  return null;
end;
$$;

create or replace function public.notify_role_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.insert_notification(
      coalesce(new.company_id, public.current_company_id()),
      null,
      'notifications.events.roleCreated.title',
      public.notification_payload(
        'notifications.events.roleCreated.message',
        json_build_object('roleName', coalesce(new.name, ''))
      ),
      'success',
      'system'
    );
  elsif tg_op = 'UPDATE' and (
    coalesce(old.name, '') <> coalesce(new.name, '')
    or coalesce(old.description, '') <> coalesce(new.description, '')
  ) then
    perform public.insert_notification(
      coalesce(new.company_id, public.current_company_id()),
      null,
      'notifications.events.roleUpdated.title',
      public.notification_payload(
        'notifications.events.roleUpdated.message',
        json_build_object('roleName', coalesce(new.name, ''))
      ),
      'info',
      'system'
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_audit_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity text;
  v_event text;
  v_status text;
begin
  v_entity := lower(coalesce(new.entity, ''));
  v_event := lower(coalesce(new.metadata->>'event', new.metadata #>> '{new,event}', ''));
  v_status := lower(coalesce(new.metadata->>'status', new.metadata #>> '{new,status}', ''));

  if v_event = 'whatsapp_failed'
    or (v_entity like '%whatsapp%' and v_status in ('failed', 'error'))
  then
    perform public.insert_notification(
      new.company_id,
      new.user_id,
      'notifications.events.whatsappFailed.title',
      public.notification_payload(
        'notifications.events.whatsappFailed.message',
        json_build_object(
          'detail', coalesce(new.metadata->>'message', new.metadata->>'error', '')
        )
      ),
      'error',
      'whatsapp'
    );
  elsif v_event = 'ai_task_completed'
    or (v_entity like '%ai%' and v_status in ('completed', 'success', 'done'))
  then
    perform public.insert_notification(
      new.company_id,
      new.user_id,
      'notifications.events.aiTaskCompleted.title',
      public.notification_payload(
        'notifications.events.aiTaskCompleted.message',
        json_build_object(
          'detail', coalesce(new.metadata->>'message', '')
        )
      ),
      'success',
      'system'
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_external_event(
  p_company_id uuid,
  p_user_id uuid,
  p_event text,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_message text;
  v_type text;
  v_category text;
begin
  if p_event = 'whatsapp_failed' then
    v_title := 'notifications.events.whatsappFailed.title';
    v_message := public.notification_payload(
      'notifications.events.whatsappFailed.message',
      json_build_object('detail', coalesce(p_message, ''))
    );
    v_type := 'error';
    v_category := 'whatsapp';
  elsif p_event = 'ai_task_completed' then
    v_title := 'notifications.events.aiTaskCompleted.title';
    v_message := public.notification_payload(
      'notifications.events.aiTaskCompleted.message',
      json_build_object('detail', coalesce(p_message, ''))
    );
    v_type := 'success';
    v_category := 'system';
  else
    raise exception 'Unsupported external event: %', p_event;
  end if;

  perform public.insert_notification(
    p_company_id,
    p_user_id,
    v_title,
    v_message,
    v_type,
    v_category
  );
end;
$$;

drop trigger if exists trg_notify_customer_created on public.customers;
create trigger trg_notify_customer_created
  after insert on public.customers
  for each row execute procedure public.notify_customer_created();

drop trigger if exists trg_notify_booking_changes on public.bookings;
create trigger trg_notify_booking_changes
  after insert or update on public.bookings
  for each row execute procedure public.notify_booking_changes();

drop trigger if exists trg_notify_invoice_changes on public.invoices;
create trigger trg_notify_invoice_changes
  after update on public.invoices
  for each row execute procedure public.notify_invoice_changes();

drop trigger if exists trg_notify_subscription_events on public.companies;
create trigger trg_notify_subscription_events
  after insert or update on public.companies
  for each row execute procedure public.notify_subscription_events();

drop trigger if exists trg_notify_profile_events on public.profiles;
create trigger trg_notify_profile_events
  after insert or delete on public.profiles
  for each row execute procedure public.notify_profile_events();

drop trigger if exists trg_notify_role_updated on public.roles;
drop trigger if exists trg_notify_role_events on public.roles;
create trigger trg_notify_role_events
  after insert or update on public.roles
  for each row execute procedure public.notify_role_events();

drop trigger if exists trg_notify_audit_events on public.audit_logs;
create trigger trg_notify_audit_events
  after insert on public.audit_logs
  for each row execute procedure public.notify_audit_events();
