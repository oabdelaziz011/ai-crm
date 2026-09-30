/**
 * Migration 388 — i18n + pay-surface follow-ups for first payment due alerts.
 * LOCAL ONLY.
 */

create or replace function public.notify_super_admins_v1(
  p_company_id uuid,
  p_title text,
  p_body text,
  p_type text default 'warning',
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_uid uuid;
  v_sa_company_id uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_type text := coalesce(nullif(trim(p_type), ''), 'warning');
  v_message text;
  v_title_key text;
  v_message_key text;
begin
  if p_company_id is null then
    raise exception 'company_id_required';
  end if;
  if v_title is null or v_body is null then
    raise exception 'title_and_message_required';
  end if;
  if v_type not in ('success', 'warning', 'error', 'info') then
    raise exception 'unsupported_notification_type';
  end if;

  -- Prefer i18n keys when callers pass English literals from enforcement.
  if v_title = 'Company subscription unpaid'
     or v_title like 'notifications.events.subscriptionUnpaid%' then
    v_title_key := 'notifications.events.subscriptionUnpaid.title';
    v_message_key := 'notifications.events.subscriptionUnpaid.message';
  else
    v_title_key := v_title;
    v_message_key := null;
  end if;

  v_message := jsonb_build_object(
    'messageKey', coalesce(v_message_key, 'notifications.events.subscriptionUnpaid.message'),
    'body', v_body,
    'params', coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
      'companyId', p_company_id,
      'entityType', 'company',
      'entityId', p_company_id,
      'detail', v_body,
      'navigationTarget', '/dashboard/subscriptions/' || p_company_id::text
    )
  )::text;

  for v_uid, v_sa_company_id in
    select p.id, p.company_id
    from public.profiles p
    where coalesce(p.is_super_admin, false) = true
  loop
    perform public.insert_notification(
      coalesce(v_sa_company_id, p_company_id),
      v_uid,
      v_title_key,
      v_message,
      v_type,
      'subscription'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.notify_super_admins_v1(uuid, text, text, text, jsonb) is
  'Creates subscription notifications for every super admin; titles/messages use i18n keys.';
