/**
 * Migration 439 — Richer in-app notification payloads (additive, local-safe).
 *
 * Enriches SQL-trigger notification params for:
 * - customer created (id, org name, source, deep-link target)
 * - invoice paid / overdue (customer, amount, invoice number)
 * - AI task completed (task/workflow detail + navigationTarget)
 *
 * Does not change notifications table schema.
 * DO NOT apply to hosted/production without explicit approval.
 */

create or replace function public.notify_customer_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_source text;
  v_org text;
begin
  v_company_id := coalesce(new.company_id, public.company_id_for_user(new.user_id));
  v_source := coalesce(nullif(trim(new.source), ''), 'manual');
  v_org := nullif(trim(coalesce(new.company_name, '')), '');

  perform public.insert_notification(
    v_company_id,
    new.user_id,
    'notifications.events.newCustomer.title',
    public.notification_payload(
      'notifications.events.newCustomer.message',
      jsonb_strip_nulls(
        jsonb_build_object(
          'name', coalesce(new.name, ''),
          'customerName', coalesce(new.name, ''),
          'customerId', new.id::text,
          'companyName', v_org,
          'source', v_source,
          'entityType', 'customer',
          'entityId', new.id::text,
          'navigationTarget', '/dashboard/customers/' || new.id::text
        )
      )
    ),
    'success',
    'system'
  );
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
  v_customer_name text;
  v_invoice_number text;
  v_amount text;
  v_params jsonb;
begin
  v_user_id := coalesce(new.user_id, old.user_id);
  v_company_id := coalesce(new.company_id, public.company_id_for_user(v_user_id));
  v_new_status := lower(coalesce(new.status, ''));
  v_old_status := lower(coalesce(old.status, ''));

  if tg_op = 'UPDATE' and v_old_status <> v_new_status then
    select nullif(trim(c.name), '')
      into v_customer_name
    from public.customers c
    where c.id = new.customer_id
    limit 1;

    v_invoice_number := nullif(trim(coalesce(new.invoice_number::text, '')), '');
    if v_invoice_number is null then
      v_invoice_number := left(new.id::text, 8);
    end if;

    if coalesce(new.total_cents, 0) > 0 then
      v_amount := trim(to_char(new.total_cents::numeric / 100.0, 'FM999999999990.00'))
        || ' ' || upper(coalesce(nullif(trim(new.currency), ''), 'USD'));
    else
      v_amount := trim(to_char(coalesce(new.amount, 0), 'FM999999999990.00'))
        || ' ' || upper(coalesce(nullif(trim(new.currency), ''), 'USD'));
    end if;

    v_params := jsonb_strip_nulls(
      jsonb_build_object(
        'invoiceId', new.id::text,
        'invoiceNumber', v_invoice_number,
        'customerId', new.customer_id::text,
        'customerName', v_customer_name,
        'name', v_customer_name,
        'amount', v_amount,
        'entityType', 'invoice',
        'entityId', new.id::text,
        'navigationTarget',
          '/dashboard/invoices?tab=invoices&invoiceId=' || new.id::text
      )
    );

    if v_new_status = 'paid' then
      perform public.insert_notification(
        v_company_id,
        v_user_id,
        'notifications.events.invoicePaid.title',
        public.notification_payload(
          'notifications.events.invoicePaid.message',
          v_params
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
          v_params
        ),
        'error',
        'invoice'
      );
    end if;
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
  v_detail text;
  v_task_name text;
  v_task_id text;
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
    v_task_name := nullif(trim(coalesce(
      new.metadata->>'taskName',
      new.metadata->>'workflowName',
      new.metadata->>'title',
      new.metadata #>> '{new,taskName}',
      ''
    )), '');
    v_task_id := nullif(trim(coalesce(
      new.metadata->>'taskId',
      new.metadata->>'workflowId',
      new.metadata->>'runId',
      new.entity_id::text,
      ''
    )), '');
    v_detail := nullif(trim(coalesce(new.metadata->>'message', '')), '');
    if v_detail is null or v_detail = '' then
      v_detail := coalesce(v_task_name, 'AI task completed successfully');
    end if;

    perform public.insert_notification(
      new.company_id,
      new.user_id,
      'notifications.events.aiTaskCompleted.title',
      public.notification_payload(
        'notifications.events.aiTaskCompleted.message',
        jsonb_strip_nulls(
          jsonb_build_object(
            'detail', v_detail,
            'taskName', v_task_name,
            'taskId', v_task_id,
            'status', 'success',
            'entityType', 'ai_task',
            'entityId', v_task_id,
            'navigationTarget', '/dashboard/ai-analytics'
          )
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
      jsonb_build_object(
        'detail', coalesce(nullif(trim(p_message), ''), 'AI task completed successfully'),
        'status', 'success',
        'navigationTarget', '/dashboard/ai-analytics'
      )
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

comment on function public.notify_customer_created() is
  'Customer-created in-app notification with id, org, source, and deep link (439).';
comment on function public.notify_invoice_changes() is
  'Invoice status notifications with customer, amount, number, and deep link (439).';
