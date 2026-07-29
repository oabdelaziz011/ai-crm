-- Sprint AI.3 Production Readiness — allow webhook service role to resolve platform AI keys

create or replace function public.platform_resolve_ai_runtime_config(
  p_company_id uuid,
  p_provider_key text default 'openai',
  p_use_case text default 'chat'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_provider public.platform_ai_providers%rowtype;
  v_model public.platform_ai_models%rowtype;
  v_key record;
  v_api_key text;
  v_feature text;
begin
  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  if auth.role() is distinct from 'service_role'
     and not public.is_super_admin()
     and p_company_id is distinct from public.current_company_id() then
    raise exception 'access denied for company %', p_company_id;
  end if;

  v_feature := case p_use_case
    when 'embeddings' then 'embeddings'
    when 'tool_calling' then 'tool_calling'
    else 'ai_chat'
  end;

  if not public.platform_ai_feature_enabled(p_company_id, v_feature) then
    raise exception 'AI feature % is disabled for this company', v_feature;
  end if;

  select * into v_provider
  from public.platform_ai_providers pap
  where pap.provider_key = p_provider_key
    and pap.is_enabled = true
  limit 1;

  if not found then
    raise exception 'platform provider % is not configured', p_provider_key;
  end if;

  select * into v_model
  from public.platform_ai_models pam
  where pam.provider_id = v_provider.id
    and pam.use_case = p_use_case
    and pam.is_enabled = true
  order by pam.is_default desc, pam.created_at asc
  limit 1;

  if not found then
    select * into v_model
    from public.platform_ai_models pam
    where pam.provider_id = v_provider.id
      and pam.use_case = 'chat'
      and pam.is_enabled = true
    order by pam.is_default desc, pam.created_at asc
    limit 1;
  end if;

  select pk.encrypted_key, pk.key_hint
  into v_key
  from public.platform_ai_provider_keys pk
  where pk.provider_id = v_provider.id
    and pk.is_active = true
  order by pk.created_at desc
  limit 1;

  if v_key.encrypted_key is null then
    raise exception 'platform provider key for % is not configured', p_provider_key;
  end if;

  v_api_key := public.platform_ai_decrypt_key(v_key.encrypted_key);

  return jsonb_build_object(
    'providerKey', v_provider.provider_key,
    'model', coalesce(v_model.model_name, v_provider.configuration->>'defaultModel', 'gpt-4o-mini'),
    'apiKey', v_api_key,
    'baseUrl', coalesce(v_provider.configuration->>'baseUrl', 'https://api.openai.com/v1'),
    'useCase', p_use_case,
    'usesPlatformKey', true
  );
end;
$$;

grant execute on function public.platform_resolve_ai_runtime_config(uuid, text, text) to service_role;
