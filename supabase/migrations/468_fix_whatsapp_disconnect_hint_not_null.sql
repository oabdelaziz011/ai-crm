-- Fix disconnect clearing: *_hint columns are NOT NULL DEFAULT ''.
-- Writing NULL caused 23502 during Embedded Signup phone reclaim / disconnect.

create or replace function public.disconnect_company_whatsapp_connection(
  p_company_id uuid,
  p_confirm_phone_number_id text default null,
  p_confirm_text text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  existing public.company_whatsapp_settings%rowtype;
  v_phone text;
  v_waba text;
  v_event_id uuid;
  v_actor uuid := coalesce(p_actor_user_id, public.whatsapp_lifecycle_actor_id());
begin
  if p_company_id is null then
    raise exception 'company_id required' using errcode = '22023';
  end if;

  if auth.role() <> 'service_role' and not public.whatsapp_settings_can_manage(p_company_id) then
    perform internal.whatsapp_lifecycle_write_event(
      'disconnect', 'rejected', p_company_id, null, null, null,
      'forbidden', 'Caller cannot manage WhatsApp settings for this company', '{}'::jsonb,
      v_actor
    );
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if lower(trim(coalesce(p_confirm_text, ''))) not in ('disconnect', 'فصل') then
    perform internal.whatsapp_lifecycle_write_event(
      'disconnect', 'rejected', p_company_id, null, null, null,
      'confirmation_required', 'Confirmation text mismatch', '{}'::jsonb,
      v_actor
    );
    raise exception 'confirmation_required' using errcode = '22023';
  end if;

  select * into existing
  from public.company_whatsapp_settings
  where company_id = p_company_id
  for update;

  if not found then
    perform internal.whatsapp_lifecycle_write_event(
      'disconnect', 'rejected', p_company_id, null, null, null,
      'not_found', 'No WhatsApp settings row for company', '{}'::jsonb,
      v_actor
    );
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_phone := nullif(trim(coalesce(existing.phone_number_id, '')), '');
  v_waba := nullif(trim(coalesce(existing.business_account_id, '')), '');

  if nullif(trim(coalesce(p_confirm_phone_number_id, '')), '') is not null
     and v_phone is not null
     and trim(p_confirm_phone_number_id) <> v_phone then
    perform internal.whatsapp_lifecycle_write_event(
      'disconnect', 'rejected', p_company_id, null, v_phone, v_waba,
      'phone_mismatch', 'Confirmed phone_number_id does not match current binding', '{}'::jsonb,
      v_actor
    );
    raise exception 'phone_mismatch' using errcode = '22023';
  end if;

  update public.company_whatsapp_settings
  set
    enabled = false,
    phone_number_id = '',
    business_account_id = '',
    access_token = '',
    access_token_encrypted = null,
    access_token_hint = '',
    webhook_verify_token = '',
    webhook_verify_token_encrypted = null,
    webhook_verify_token_hint = '',
    webhook_verify_token_lookup_hash = null,
    app_secret_encrypted = null,
    app_secret_hint = '',
    token_status = 'missing',
    token_expires_at = null,
    token_checked_at = null,
    last_auth_error = null,
    last_auth_error_at = null,
    last_auth_error_code = null,
    updated_at = timezone('utc', now())
  where company_id = p_company_id;

  begin
    perform public.sync_whatsapp_channel_references(p_company_id);
  exception
    when others then
      null; -- channel sync best-effort; disconnect still succeeds
  end;

  v_event_id := internal.whatsapp_lifecycle_write_event(
    'disconnect', 'succeeded', p_company_id, null, v_phone, v_waba,
    null, null,
    jsonb_build_object(
      'cleared_credentials', true,
      'meta_graph_calls', 'none',
      'note', 'ValueOR binding cleared only; Meta phone/WABA unchanged'
    ),
    v_actor
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'disconnect',
    'company_id', p_company_id,
    'phone_number_id', v_phone,
    'business_account_id', v_waba,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.disconnect_company_whatsapp_connection(uuid, text, text, uuid) from public;
grant execute on function public.disconnect_company_whatsapp_connection(uuid, text, text, uuid)
  to authenticated, service_role;
