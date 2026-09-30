-- ============================================================
-- 393 — Platform AI provider: readiness + auto-ensure company binding
--
-- ValueOR owns ONE platform AI provider/API key for all tenants.
-- Companies keep a lightweight ai_provider_connections row
-- (uses_platform_key=true, no credentials) as a tenant binding only.
--
-- This migration:
--   1) Exposes non-secret platform provider readiness to authenticated users
--   2) Auto-creates/enables the company binding when the platform provider is ready
--   3) Never returns decrypted API keys to the browser
-- ============================================================

create or replace function public.platform_ai_provider_readiness(
  p_provider_key text default 'openai'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_provider public.platform_ai_providers%rowtype;
  v_model_name text;
  v_key_hint text;
  v_has_active_key boolean := false;
begin
  if auth.uid() is null and auth.role() is distinct from 'service_role' then
    raise exception 'authentication required';
  end if;

  select * into v_provider
  from public.platform_ai_providers pap
  where pap.provider_key = coalesce(nullif(trim(p_provider_key), ''), 'openai')
  limit 1;

  if not found then
    return jsonb_build_object(
      'ready', false,
      'providerKey', coalesce(nullif(trim(p_provider_key), ''), 'openai'),
      'displayName', null,
      'isEnabled', false,
      'hasActiveKey', false,
      'model', null,
      'keyHint', null,
      'errorCode', 'AI_PROVIDER_NOT_CONFIGURED'
    );
  end if;

  select pam.model_name
  into v_model_name
  from public.platform_ai_models pam
  where pam.provider_id = v_provider.id
    and pam.use_case = 'chat'
    and pam.is_enabled = true
  order by pam.is_default desc, pam.created_at asc
  limit 1;

  select pk.key_hint, true
  into v_key_hint, v_has_active_key
  from public.platform_ai_provider_keys pk
  where pk.provider_id = v_provider.id
    and pk.is_active = true
  order by pk.created_at desc
  limit 1;

  if not found then
    v_has_active_key := false;
    v_key_hint := null;
  end if;

  return jsonb_build_object(
    'ready', (v_provider.is_enabled and v_has_active_key),
    'providerKey', v_provider.provider_key,
    'displayName', v_provider.display_name,
    'isEnabled', v_provider.is_enabled,
    'hasActiveKey', v_has_active_key,
    'model', coalesce(v_model_name, v_provider.configuration->>'defaultModel', 'gpt-4o-mini'),
    'keyHint', v_key_hint,
    'errorCode', case
      when not v_provider.is_enabled then 'AI_PROVIDER_UNAVAILABLE'
      when not v_has_active_key then 'AI_PROVIDER_NOT_CONFIGURED'
      else null
    end
  );
end;
$$;

revoke all on function public.platform_ai_provider_readiness(text) from public;
grant execute on function public.platform_ai_provider_readiness(text) to authenticated;
grant execute on function public.platform_ai_provider_readiness(text) to service_role;

comment on function public.platform_ai_provider_readiness(text) is
  'Non-secret platform AI provider readiness. Never returns decrypted API keys.';

create or replace function public.ensure_company_platform_ai_provider_connection(
  p_company_id uuid,
  p_provider_key text default 'openai'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider_key text := coalesce(nullif(trim(p_provider_key), ''), 'openai');
  v_readiness jsonb;
  v_definition_id uuid;
  v_model text;
  v_connection_id uuid;
  v_created boolean := false;
  v_display_name text;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if auth.role() is distinct from 'service_role'
     and not public.is_super_admin()
     and public.current_company_id() is distinct from p_company_id then
    raise exception 'company access denied';
  end if;

  if auth.uid() is null and auth.role() is distinct from 'service_role' then
    raise exception 'authentication required';
  end if;

  v_readiness := public.platform_ai_provider_readiness(v_provider_key);

  if coalesce((v_readiness->>'ready')::boolean, false) is not true then
    return jsonb_build_object(
      'ready', false,
      'created', false,
      'connectionId', null,
      'providerKey', v_provider_key,
      'errorCode', coalesce(v_readiness->>'errorCode', 'AI_PROVIDER_NOT_CONFIGURED')
    );
  end if;

  select d.id
  into v_definition_id
  from public.ai_provider_definitions d
  where d.key = v_provider_key
    and d.is_active = true
  limit 1;

  if v_definition_id is null then
    return jsonb_build_object(
      'ready', false,
      'created', false,
      'connectionId', null,
      'providerKey', v_provider_key,
      'errorCode', 'AI_PROVIDER_NOT_CONFIGURED'
    );
  end if;

  v_model := coalesce(v_readiness->>'model', 'gpt-4o-mini');
  v_display_name := coalesce(v_readiness->>'displayName', 'OpenAI') || ' (Platform)';

  select c.id
  into v_connection_id
  from public.ai_provider_connections c
  where c.company_id = p_company_id
    and c.provider_id = v_definition_id
    and c.deleted_at is null
  order by c.is_default desc, c.is_enabled desc, c.updated_at desc
  limit 1;

  if v_connection_id is not null then
    update public.ai_provider_connections
    set
      is_enabled = true,
      is_default = true,
      uses_platform_key = true,
      status = 'active',
      configuration = (
        coalesce(configuration, '{}'::jsonb)
        - 'apiKey' - 'api_key' - 'secret' - 'token'
      ) || jsonb_build_object('model', coalesce(nullif(configuration->>'model', ''), v_model)),
      updated_at = now()
    where id = v_connection_id;

    -- Ensure only one default for this company.
    update public.ai_provider_connections
    set is_default = false, updated_at = now()
    where company_id = p_company_id
      and deleted_at is null
      and id is distinct from v_connection_id
      and is_default = true;
  else
    update public.ai_provider_connections
    set is_default = false, updated_at = now()
    where company_id = p_company_id
      and deleted_at is null
      and is_default = true;

    insert into public.ai_provider_connections (
      company_id,
      provider_id,
      display_name,
      configuration,
      is_default,
      is_enabled,
      uses_platform_key,
      status,
      health_status
    ) values (
      p_company_id,
      v_definition_id,
      v_display_name,
      jsonb_build_object('model', v_model),
      true,
      true,
      true,
      'active',
      'unknown'
    )
    returning id into v_connection_id;

    v_created := true;
  end if;

  return jsonb_build_object(
    'ready', true,
    'created', v_created,
    'connectionId', v_connection_id,
    'providerKey', v_provider_key,
    'errorCode', null
  );
end;
$$;

revoke all on function public.ensure_company_platform_ai_provider_connection(uuid, text) from public;
grant execute on function public.ensure_company_platform_ai_provider_connection(uuid, text) to authenticated;
grant execute on function public.ensure_company_platform_ai_provider_connection(uuid, text) to service_role;

comment on function public.ensure_company_platform_ai_provider_connection(uuid, text) is
  'Ensures a keyless uses_platform_key company AI provider binding when the platform provider is ready. Never stores or returns API keys.';
