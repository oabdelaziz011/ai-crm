-- ============================================================
-- Vault OS – notification_payload json/jsonb compatibility
-- Fixes: function public.notification_payload(unknown, json) does not exist
-- when audit/notification triggers pass json_build_object (json) instead of jsonb.
-- ============================================================

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

create or replace function public.notification_payload(
  p_message_key text,
  p_params json
)
returns text
language sql
immutable
as $$
  select public.notification_payload(p_message_key, coalesce(p_params, '{}'::json)::jsonb);
$$;
