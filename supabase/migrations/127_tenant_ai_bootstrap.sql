-- ============================================================
-- Vault OS – Sprint A1-02: Tenant AI Bootstrap
-- Idempotent AI defaults for newly provisioned tenants.
-- ============================================================

create or replace function public.provision_tenant_ai_bootstrap(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company public.companies%rowtype;
  v_openai_key text;
  v_provider_enabled boolean;
  v_openai_provider_id uuid;
  v_openai_embedding_provider_id uuid;
  v_pgvector_provider_id uuid;
  v_ai_connection_id uuid;
  v_embedding_connection_id uuid;
  v_vector_connection_id uuid;
  v_collection_id uuid;
  v_retrieval_policy_id uuid;
  v_execution_policy_id uuid;
  v_search_policy_id uuid;
  v_template_id uuid;
  v_version_id uuid;
  v_steps jsonb := '[]'::jsonb;
begin
  perform public.assert_trusted_provisioning_caller();

  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  select *
  into v_company
  from public.companies c
  where c.id = p_company_id;

  if not found then
    raise exception 'company % not found', p_company_id;
  end if;

  if coalesce(v_company.company_type, 'tenant') in ('platform', 'demo') then
    return jsonb_build_object(
      'company_id', p_company_id,
      'skipped', true,
      'reason', 'non_tenant_company',
      'steps', v_steps
    );
  end if;

  v_openai_key := nullif(
    trim(
      coalesce(
        current_setting('vault.openai_api_key', true),
        current_setting('app.openai_api_key', true),
        ''
      )
    ),
    ''
  );
  v_provider_enabled := v_openai_key is not null;

  select id into v_openai_provider_id
  from public.ai_provider_definitions
  where key = 'openai'
  limit 1;

  select id into v_openai_embedding_provider_id
  from public.embedding_provider_definitions
  where key = 'openai'
  limit 1;

  select id into v_pgvector_provider_id
  from public.vector_store_definitions
  where key = 'pgvector'
  limit 1;

  -- 1) AI assistant settings (insert-only)
  if not exists (
    select 1 from public.ai_assistant_settings s where s.company_id = p_company_id
  ) then
    insert into public.ai_assistant_settings (
      company_id,
      is_enabled,
      provider,
      model,
      temperature,
      max_tokens,
      response_language,
      assistant_name,
      language,
      personality,
      tone,
      welcome_message,
      fallback_message,
      knowledge_enabled
    ) values (
      p_company_id,
      true,
      'openai',
      'gpt-5.5',
      0.3,
      1000,
      'system',
      'Vault Assistant',
      'en',
      'helpful',
      'professional',
      'Hello! I''m your AI assistant. How can I help you today?',
      'I''m sorry, I didn''t understand that. Could you please rephrase your question?',
      true
    );

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object('step', 'assistant_settings', 'created', true, 'skipped', false)
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object('step', 'assistant_settings', 'created', false, 'skipped', true)
    );
  end if;

  -- 2) OpenAI provider connection (preserve existing)
  select c.id
  into v_ai_connection_id
  from public.ai_provider_connections c
  join public.ai_provider_definitions d on d.id = c.provider_id
  where c.company_id = p_company_id
    and c.deleted_at is null
    and d.key = 'openai'
  limit 1;

  if v_ai_connection_id is null and v_openai_provider_id is not null then
    insert into public.ai_provider_connections (
      company_id,
      provider_id,
      display_name,
      status,
      configuration,
      is_default,
      is_enabled,
      health_status
    ) values (
      p_company_id,
      v_openai_provider_id,
      'Default OpenAI Connection',
      case when v_provider_enabled then 'active' else 'disabled' end,
      case
        when v_provider_enabled then jsonb_build_object(
          'model', 'gpt-5.5',
          'apiKey', v_openai_key,
          'execution_policy', jsonb_build_object('streaming', true, 'response_format', 'text')
        )
        else jsonb_build_object(
          'model', 'gpt-5.5',
          'execution_policy', jsonb_build_object('streaming', true, 'response_format', 'text')
        )
      end,
      true,
      v_provider_enabled,
      case when v_provider_enabled then 'connected' else 'disconnected' end
    )
    returning id into v_ai_connection_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'ai_provider_connection',
        'created', true,
        'skipped', false,
        'resourceId', v_ai_connection_id
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'ai_provider_connection',
        'created', false,
        'skipped', true,
        'resourceId', v_ai_connection_id
      )
    );
  end if;

  -- 3) Embedding connection (preserve existing)
  select c.id
  into v_embedding_connection_id
  from public.embedding_provider_connections c
  join public.embedding_provider_definitions d on d.id = c.provider_id
  where c.company_id = p_company_id
    and c.deleted_at is null
    and d.key = 'openai'
  limit 1;

  if v_embedding_connection_id is null and v_openai_embedding_provider_id is not null then
    insert into public.embedding_provider_connections (
      company_id,
      provider_id,
      display_name,
      status,
      configuration,
      is_default,
      is_enabled,
      health_status
    ) values (
      p_company_id,
      v_openai_embedding_provider_id,
      'Default OpenAI Embeddings',
      case when v_provider_enabled then 'active' else 'disabled' end,
      case
        when v_provider_enabled then jsonb_build_object(
          'model', 'text-embedding-3-small',
          'dimensions', 1536,
          'apiKey', v_openai_key
        )
        else jsonb_build_object(
          'model', 'text-embedding-3-small',
          'dimensions', 1536
        )
      end,
      true,
      v_provider_enabled,
      case when v_provider_enabled then 'connected' else 'disconnected' end
    )
    returning id into v_embedding_connection_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'embedding_connection',
        'created', true,
        'skipped', false,
        'resourceId', v_embedding_connection_id
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'embedding_connection',
        'created', false,
        'skipped', true,
        'resourceId', v_embedding_connection_id
      )
    );
  end if;

  -- 4) Vector store connection (preserve existing)
  select c.id
  into v_vector_connection_id
  from public.vector_store_connections c
  join public.vector_store_definitions d on d.id = c.provider_id
  where c.company_id = p_company_id
    and c.deleted_at is null
    and d.key = 'pgvector'
  limit 1;

  if v_vector_connection_id is null and v_pgvector_provider_id is not null then
    insert into public.vector_store_connections (
      company_id,
      provider_id,
      display_name,
      status,
      configuration,
      is_default,
      is_enabled,
      health_status,
      last_health_check
    ) values (
      p_company_id,
      v_pgvector_provider_id,
      'Default PGVector Store',
      'active',
      jsonb_build_object('schema', 'public', 'tablePrefix', 'vs_', 'companyId', p_company_id::text),
      true,
      true,
      'connected',
      now()
    )
    returning id into v_vector_connection_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'vector_store_connection',
        'created', true,
        'skipped', false,
        'resourceId', v_vector_connection_id
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'vector_store_connection',
        'created', false,
        'skipped', true,
        'resourceId', v_vector_connection_id
      )
    );
  end if;

  -- 5) Default knowledge collection (preserve existing)
  select vc.id
  into v_collection_id
  from public.vector_collections vc
  where vc.company_id = p_company_id
    and vc.name = 'knowledge_default'
    and vc.deleted_at is null
  limit 1;

  if v_collection_id is null and v_vector_connection_id is not null then
    perform public.pgvector_create_collection(
      p_company_id,
      'knowledge_default',
      1536,
      jsonb_build_object('bootstrap', true, 'purpose', 'knowledge_default')
    );

    insert into public.vector_collections (
      company_id,
      connection_id,
      name,
      provider,
      embedding_version,
      status,
      is_active,
      metadata
    ) values (
      p_company_id,
      v_vector_connection_id,
      'knowledge_default',
      'pgvector',
      1,
      'active',
      true,
      jsonb_build_object('bootstrap', true, 'purpose', 'knowledge_default')
    )
    returning id into v_collection_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'knowledge_collection',
        'created', true,
        'skipped', false,
        'resourceId', v_collection_id
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'knowledge_collection',
        'created', false,
        'skipped', true,
        'resourceId', v_collection_id
      )
    );
  end if;

  -- 6) Retrieval policy
  select rp.id
  into v_retrieval_policy_id
  from public.retrieval_policies rp
  where rp.company_id = p_company_id
    and rp.is_default = true
  limit 1;

  if v_retrieval_policy_id is null then
    insert into public.retrieval_policies (
      company_id,
      policy_name,
      max_context_tokens,
      max_chunks,
      window_expansion,
      min_source_diversity,
      overlap_removal_threshold,
      default_language,
      chunk_selection_strategy,
      is_default,
      metadata
    ) values (
      p_company_id,
      'tenant_default_retrieval',
      4096,
      20,
      1,
      1,
      0.8500,
      'en',
      'score_first',
      true,
      jsonb_build_object('bootstrap', true)
    )
    returning id into v_retrieval_policy_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'retrieval_policy',
        'created', true,
        'skipped', false,
        'resourceId', v_retrieval_policy_id
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'retrieval_policy',
        'created', false,
        'skipped', true,
        'resourceId', v_retrieval_policy_id
      )
    );
  end if;

  -- 7) Runtime execution policy
  select ep.id
  into v_execution_policy_id
  from public.execution_policies ep
  where ep.company_id = p_company_id
    and ep.is_default = true
  limit 1;

  if v_execution_policy_id is null then
    insert into public.execution_policies (
      company_id,
      policy_name,
      knowledge_retrieval_enabled,
      max_pipeline_duration_ms,
      is_default,
      metadata
    ) values (
      p_company_id,
      'tenant_default_runtime',
      true,
      120000,
      true,
      jsonb_build_object('bootstrap', true)
    )
    returning id into v_execution_policy_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'execution_policy',
        'created', true,
        'skipped', false,
        'resourceId', v_execution_policy_id
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'execution_policy',
        'created', false,
        'skipped', true,
        'resourceId', v_execution_policy_id
      )
    );
  end if;

  -- 8) Vector search policy
  select sp.id
  into v_search_policy_id
  from public.vector_search_policies sp
  where sp.company_id = p_company_id
    and sp.is_default = true
  limit 1;

  if v_search_policy_id is null then
    insert into public.vector_search_policies (
      company_id,
      policy_name,
      default_top_k,
      minimum_similarity_score,
      maximum_results,
      is_default,
      metadata
    ) values (
      p_company_id,
      'tenant_default_search',
      10,
      0.0000,
      50,
      true,
      jsonb_build_object('bootstrap', true)
    )
    returning id into v_search_policy_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'vector_search_policy',
        'created', true,
        'skipped', false,
        'resourceId', v_search_policy_id
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'vector_search_policy',
        'created', false,
        'skipped', true,
        'resourceId', v_search_policy_id
      )
    );
  end if;

  -- 9) Prompt templates (English + Arabic)
  if not exists (
    select 1
    from public.prompt_templates pt
    where pt.company_id = p_company_id
      and pt.key = 'tenant_conversation_en'
  ) then
    insert into public.prompt_templates (
      company_id,
      key,
      display_name,
      description,
      template_type,
      section_order,
      is_enabled
    ) values (
      p_company_id,
      'tenant_conversation_en',
      'Tenant Conversation (English)',
      'Tenant bootstrap conversation prompt template.',
      'conversation',
      '["system_instructions","language"]'::jsonb,
      true
    )
    returning id into v_template_id;

    insert into public.prompt_template_versions (
      template_id,
      version_number,
      version_label,
      sections,
      is_active
    ) values (
      v_template_id,
      1,
      '1.0.0',
      jsonb_build_object(
        'system_instructions', 'You are a helpful company AI assistant. Respond clearly, accurately, and professionally in English unless the user requests another language.',
        'language', 'Respond in English unless the user explicitly requests Arabic.'
      ),
      true
    )
    returning id into v_version_id;

    update public.prompt_templates
    set active_version_id = v_version_id
    where id = v_template_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'prompt_templates',
        'created', true,
        'skipped', false,
        'resourceId', v_template_id,
        'detail', 'tenant_conversation_en'
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object('step', 'prompt_templates', 'created', false, 'skipped', true, 'detail', 'tenant_conversation_en')
    );
  end if;

  if not exists (
    select 1
    from public.prompt_templates pt
    where pt.company_id = p_company_id
      and pt.key = 'tenant_conversation_ar'
  ) then
    insert into public.prompt_templates (
      company_id,
      key,
      display_name,
      description,
      template_type,
      section_order,
      is_enabled
    ) values (
      p_company_id,
      'tenant_conversation_ar',
      'Tenant Conversation (Arabic)',
      'Tenant bootstrap conversation prompt template.',
      'conversation',
      '["system_instructions","language"]'::jsonb,
      true
    )
    returning id into v_template_id;

    insert into public.prompt_template_versions (
      template_id,
      version_number,
      version_label,
      sections,
      is_active
    ) values (
      v_template_id,
      1,
      '1.0.0',
      jsonb_build_object(
        'system_instructions', 'أنت مساعد ذكي للشركة. قدم إجابات واضحة ودقيقة ومهنية باللغة العربية ما لم يطلب المستخدم لغة أخرى.',
        'language', 'Respond in Arabic unless the user explicitly requests English.'
      ),
      true
    )
    returning id into v_version_id;

    update public.prompt_templates
    set active_version_id = v_version_id
    where id = v_template_id;

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'step', 'prompt_templates',
        'created', true,
        'skipped', false,
        'resourceId', v_template_id,
        'detail', 'tenant_conversation_ar'
      )
    );
  else
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object('step', 'prompt_templates', 'created', false, 'skipped', true, 'detail', 'tenant_conversation_ar')
    );
  end if;

  return jsonb_build_object(
    'company_id', p_company_id,
    'skipped', false,
    'steps', v_steps
  );
end;
$$;

create or replace function public.repair_tenant_ai_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_repaired integer := 0;
begin
  perform public.assert_trusted_provisioning_caller();

  for v_company in
    select c.id, c.name
    from public.companies c
    where coalesce(c.company_type, 'tenant') not in ('platform', 'demo')
    order by c.created_at
  loop
    begin
      v_result := public.provision_tenant_ai_bootstrap(v_company.id);
    exception
      when others then
        v_result := jsonb_build_object(
          'company_id', v_company.id,
          'skipped', true,
          'reason', 'failed',
          'error', sqlerrm
        );
    end;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'company_id', v_company.id,
        'company_name', v_company.name,
        'result', v_result
      )
    );
    v_repaired := v_repaired + 1;
  end loop;

  return jsonb_build_object(
    'repaired', v_repaired,
    'companies', v_results
  );
end;
$$;

create or replace function public.execute_tenant_provisioning(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
  v_roles jsonb;
  v_ai jsonb;
  v_error text;
begin
  perform public.assert_trusted_provisioning_caller();

  if p_company_id is null then
    raise exception 'company_id is required';
  end if;

  select *
  into v_company
  from public.companies c
  where c.id = p_company_id
  for update;

  if not found then
    raise exception 'company % not found', p_company_id;
  end if;

  if coalesce(v_company.company_type, 'tenant') in ('platform', 'demo') then
    update public.companies
    set tenant_provisioning_status = 'completed',
        provisioned_at = coalesce(provisioned_at, now()),
        provisioning_error = null
    where id = p_company_id;

    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'skipped', true,
      'reason', 'non_tenant_company'
    );
  end if;

  if v_company.tenant_provisioning_status = 'completed'
     and (
       select count(distinct r.template_key)
       from public.roles r
       where r.company_id = p_company_id
         and r.role_type = 'DEFAULT'
         and r.template_key in ('admin', 'manager', 'employee')
     ) = 3 then
    v_ai := public.provision_tenant_ai_bootstrap(p_company_id);
    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'skipped', true,
      'reason', 'already_provisioned',
      'ai_bootstrap', v_ai
    );
  end if;

  if v_company.tenant_provisioning_status = 'provisioning' then
    raise exception 'company % provisioning already in progress', p_company_id;
  end if;

  update public.companies
  set tenant_provisioning_status = 'provisioning',
      provisioning_attempt_count = provisioning_attempt_count + 1,
      provisioning_error = null
  where id = p_company_id;

  begin
    v_roles := public.provision_tenant_default_roles(p_company_id);
    v_ai := public.provision_tenant_ai_bootstrap(p_company_id);

    update public.companies
    set tenant_provisioning_status = 'completed',
        provisioned_at = now(),
        provisioning_error = null
    where id = p_company_id;

    return jsonb_build_object(
      'company_id', p_company_id,
      'status', 'completed',
      'roles', v_roles,
      'ai_bootstrap', v_ai
    );
  exception
    when others then
      get stacked diagnostics v_error = message_text;
      update public.companies
      set tenant_provisioning_status = 'failed',
          provisioning_error = v_error
      where id = p_company_id;
      raise;
  end;
end;
$$;

revoke all on function public.provision_tenant_ai_bootstrap(uuid) from public;
revoke all on function public.repair_tenant_ai_bootstrap() from public;

grant execute on function public.provision_tenant_ai_bootstrap(uuid) to service_role;
grant execute on function public.repair_tenant_ai_bootstrap() to service_role;
grant execute on function public.repair_tenant_ai_bootstrap() to authenticated;

-- Backfill existing tenants idempotently during migration apply.
do $$
begin
  perform set_config('vault.provisioning_bootstrap', 'true', true);
  perform public.repair_tenant_ai_bootstrap();
  perform set_config('vault.provisioning_bootstrap', 'false', true);
end;
$$;
