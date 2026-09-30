-- =============================================================================
-- 400 — Public Web Chat backend (Phase 2, feature-gated, service-role only)
-- =============================================================================
-- Server-side primitives for /api/public/web-chat (api-server, service role):
--   - widget channel activation follows web_chat_widgets.enabled
--   - web_chat_message_submissions: idempotency ledger (session_id + client_message_id)
--   - web_chat_public_* RPCs: widget resolution + availability, visitor session
--     create/authorize, atomic conversation provisioning, message claim/complete,
--     AI-failure fallback message, visitor-safe message read
--
-- Every RPC is EXECUTE-granted to service_role only (never anon/authenticated).
-- Availability = widget enabled + dedicated channel enabled
--              + is_feature_enabled(company, 'web_chat_widget')
--              + internal.company_publicly_unlocked(company)
-- Conversations are created here (not via ChannelConversationPort.createConversation),
-- so no ConversationStarted smart-capture lead is created for anonymous visitors.
--
-- Does NOT: grant anon anything, change generic.web_chat / internal AI chat,
-- the web_chat catalog, channel commercial mapping, or Meta / Email / SMS.
-- =============================================================================

-- ── Widget channel guard: activation allowed (default + provider guards kept) ──

create or replace function internal.guard_web_widget_company_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if tg_op = 'UPDATE'
     and old.provider is distinct from new.provider
     and (old.provider = 'valueor.web_widget' or new.provider = 'valueor.web_widget') then
    raise exception 'Web widget channel provider is immutable';
  end if;

  if new.provider is distinct from 'valueor.web_widget' then
    return new;
  end if;

  select ch.key into v_key
  from public.communication_channels ch
  where ch.id = new.channel_id;

  if v_key is distinct from 'web_chat' then
    raise exception 'Web widget channel must use the web_chat catalog key';
  end if;

  if new.is_default then
    raise exception 'Web widget channel cannot be the default company channel';
  end if;

  return new;
end;
$$;

create or replace function internal.web_chat_widgets_sync_channel_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.enabled is distinct from old.enabled then
    update public.company_channels cc
    set is_enabled = new.enabled,
        status = case when new.enabled then 'active' else 'pending' end
    where cc.id = new.company_channel_id
      and cc.company_id = new.company_id
      and cc.provider = 'valueor.web_widget'
      and (cc.is_enabled is distinct from new.enabled
           or cc.status is distinct from case when new.enabled then 'active' else 'pending' end);
  end if;
  return new;
end;
$$;

drop trigger if exists web_chat_widgets_sync_channel_state on public.web_chat_widgets;
create trigger web_chat_widgets_sync_channel_state
  after insert or update of enabled on public.web_chat_widgets
  for each row execute function internal.web_chat_widgets_sync_channel_state();

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function internal.web_chat_widget_available(p_widget_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, internal
as $$
  select p_widget_id is not null and exists (
    select 1
    from public.web_chat_widgets w
    join public.company_channels cc on cc.id = w.company_channel_id
    join public.communication_channels ch on ch.id = cc.channel_id
    where w.id = p_widget_id
      and w.enabled
      and cc.company_id = w.company_id
      and cc.provider = 'valueor.web_widget'
      and ch.key = 'web_chat'
      and cc.is_enabled
      and cc.deleted_at is null
      and internal.company_publicly_unlocked(w.company_id)
      and public.is_feature_enabled(w.company_id, 'web_chat_widget')
  );
$$;

comment on function internal.web_chat_widget_available(uuid) is
  'Public Web Chat availability: widget enabled + dedicated channel enabled + web_chat_widget entitlement + company not suspended. Evaluated on every public request.';

create or replace function internal.web_chat_widget_employee_id(p_widget_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.web_chat_widgets w
  join public.ai_employees e on e.id = w.ai_employee_id
  where w.id = p_widget_id
    and e.company_id = w.company_id
    and e.status = 'published'
    and e.published_version_id is not null
    and e.deleted_at is null;
$$;

comment on function internal.web_chat_widget_employee_id(uuid) is
  'Only the AI Employee explicitly bound to the widget, same company, published, not deleted/archived. Never falls back to another employee.';

revoke all on function internal.web_chat_widget_available(uuid) from public, anon, authenticated;
revoke all on function internal.web_chat_widget_employee_id(uuid) from public, anon, authenticated;
grant execute on function internal.web_chat_widget_available(uuid) to service_role;
grant execute on function internal.web_chat_widget_employee_id(uuid) to service_role;

-- ── Idempotency ledger ──────────────────────────────────────────────────────

create table if not exists public.web_chat_message_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid not null references public.web_chat_visitor_sessions(id) on delete cascade,
  client_message_id text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  outcome text,
  incoming_message_id uuid references public.conversation_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_chat_message_submissions_client_id_format
    check (client_message_id ~ '^[A-Za-z0-9_.:-]{8,100}$'),
  constraint web_chat_message_submissions_outcome_len
    check (outcome is null or char_length(outcome) <= 40),
  constraint web_chat_message_submissions_unique unique (session_id, client_message_id)
);

comment on table public.web_chat_message_submissions is
  'Public Web Chat idempotency ledger. One row per (session_id, client_message_id); prevents duplicate messages and duplicate AI runs. Not a message store.';

create index if not exists idx_web_chat_message_submissions_company
  on public.web_chat_message_submissions (company_id, created_at desc);

drop trigger if exists web_chat_message_submissions_updated_at on public.web_chat_message_submissions;
create trigger web_chat_message_submissions_updated_at
  before update on public.web_chat_message_submissions
  for each row execute function public.set_updated_at();

alter table public.web_chat_message_submissions enable row level security;
revoke all on public.web_chat_message_submissions from public, anon, authenticated;
grant select on public.web_chat_message_submissions to authenticated;
grant all on public.web_chat_message_submissions to service_role;

drop policy if exists web_chat_message_submissions_select on public.web_chat_message_submissions;
create policy web_chat_message_submissions_select on public.web_chat_message_submissions
  for select to authenticated
  using (internal.web_presence_access(company_id, 'web_chat_widget', false));

drop policy if exists rls_workspace_lock_suspended_web_chat_message_submissions on public.web_chat_message_submissions;
create policy rls_workspace_lock_suspended_web_chat_message_submissions on public.web_chat_message_submissions
  as restrictive for all to authenticated
  using (public.company_workspace_unlocked(company_id))
  with check (public.company_workspace_unlocked(company_id));

-- ── Public RPCs (service_role only) ─────────────────────────────────────────

create or replace function public.web_chat_public_resolve_widget(p_public_key text)
returns table (
  widget_id uuid,
  company_id uuid,
  company_channel_id uuid,
  allowed_origins text[],
  ai_employee_id uuid,
  greeting text,
  config jsonb
)
language sql
stable
security definer
set search_path = public, internal
as $$
  select w.id, w.company_id, w.company_channel_id, w.allowed_origins,
         internal.web_chat_widget_employee_id(w.id), w.greeting, w.config
  from public.web_chat_widgets w
  where p_public_key ~ '^wcw_[0-9a-f]{48}$'
    and w.public_key = p_public_key
    and internal.web_chat_widget_available(w.id);
$$;

create or replace function public.web_chat_public_create_session(
  p_widget_id uuid,
  p_token_hash text,
  p_visitor_id text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_ttl_seconds integer,
  p_max_active_per_ip integer
)
returns uuid
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_company_id uuid;
  v_active integer;
  v_id uuid;
  v_ttl integer := least(greatest(coalesce(p_ttl_seconds, 86400), 300), 604800);
  v_max integer := least(greatest(coalesce(p_max_active_per_ip, 5), 1), 100);
begin
  if not internal.web_chat_widget_available(p_widget_id) then
    raise exception 'web_chat_unavailable';
  end if;

  select w.company_id into v_company_id
  from public.web_chat_widgets w
  where w.id = p_widget_id;

  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_widget_id::text || ':' || p_ip_hash, 0));

    select count(*) into v_active
    from public.web_chat_visitor_sessions s
    where s.widget_id = p_widget_id
      and s.ip_hash = p_ip_hash
      and not s.blocked
      and s.expires_at > now();

    if v_active >= v_max then
      raise exception 'web_chat_session_limit';
    end if;
  end if;

  insert into public.web_chat_visitor_sessions (
    company_id, widget_id, token_hash, visitor_id, ip_hash, user_agent_hash, expires_at
  ) values (
    v_company_id, p_widget_id, p_token_hash, p_visitor_id, p_ip_hash, p_user_agent_hash,
    now() + make_interval(secs => v_ttl)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.web_chat_public_resume_session(
  p_widget_id uuid,
  p_token_hash text
)
returns table (session_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, internal
as $$
#variable_conflict use_column
begin
  if not internal.web_chat_widget_available(p_widget_id) then
    return;
  end if;

  return query
  with touched as (
    update public.web_chat_visitor_sessions s
    set last_seen_at = now()
    where s.token_hash = p_token_hash
      and s.widget_id = p_widget_id
      and not s.blocked
      and s.expires_at > now()
    returning s.id, s.expires_at
  )
  select t.id, t.expires_at from touched t;
end;
$$;

create or replace function public.web_chat_public_authorize_session(
  p_session_id uuid,
  p_token_hash text
)
returns table (
  session_id uuid,
  company_id uuid,
  widget_id uuid,
  company_channel_id uuid,
  conversation_id uuid,
  allowed_origins text[],
  ai_employee_id uuid,
  config jsonb,
  available boolean
)
language sql
stable
security definer
set search_path = public, internal
as $$
  select s.id, s.company_id, s.widget_id, w.company_channel_id, s.conversation_id,
         w.allowed_origins, internal.web_chat_widget_employee_id(w.id), w.config,
         internal.web_chat_widget_available(w.id)
  from public.web_chat_visitor_sessions s
  join public.web_chat_widgets w on w.id = s.widget_id and w.company_id = s.company_id
  where s.id = p_session_id
    and s.token_hash = p_token_hash
    and not s.blocked
    and s.expires_at > now();
$$;

-- CORS preflight cannot carry the visitor token; returns origins only for an active
-- session on an available widget (unknown/expired/blocked → empty, same as not allowed).
create or replace function public.web_chat_public_session_allowed_origins(p_session_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, internal
as $$
  select coalesce((
    select w.allowed_origins
    from public.web_chat_visitor_sessions s
    join public.web_chat_widgets w on w.id = s.widget_id and w.company_id = s.company_id
    where s.id = p_session_id
      and not s.blocked
      and s.expires_at > now()
      and internal.web_chat_widget_available(w.id)
  ), '{}'::text[]);
$$;

create or replace function public.web_chat_public_ensure_conversation(p_session_id uuid)
returns table (conversation_id uuid, channel_session_id uuid, external_thread_id text)
language plpgsql
security definer
set search_path = public, internal
as $$
#variable_conflict use_column
declare
  v_session public.web_chat_visitor_sessions%rowtype;
  v_widget public.web_chat_widgets%rowtype;
  v_thread text;
  v_assistant_id uuid;
  v_employee_id uuid;
  v_employee record;
  v_metadata jsonb;
  v_conversation_id uuid;
  v_channel_session_id uuid;
begin
  select * into v_session
  from public.web_chat_visitor_sessions s
  where s.id = p_session_id
  for update;

  if not found or v_session.blocked or v_session.expires_at <= now() then
    raise exception 'web_chat_unavailable';
  end if;

  select * into v_widget
  from public.web_chat_widgets w
  where w.id = v_session.widget_id and w.company_id = v_session.company_id;

  if not found or not internal.web_chat_widget_available(v_widget.id) then
    raise exception 'web_chat_unavailable';
  end if;

  v_thread := 'webchat:' || v_session.id::text;

  if v_session.conversation_id is not null then
    select cs.id into v_channel_session_id
    from public.channel_sessions cs
    where cs.company_channel_id = v_widget.company_channel_id
      and cs.external_thread_id = v_thread;

    if v_channel_session_id is null then
      insert into public.channel_sessions (
        company_id, company_channel_id, conversation_id, channel_key, external_thread_id, sender_external_id
      ) values (
        v_session.company_id, v_widget.company_channel_id, v_session.conversation_id, 'web_chat', v_thread, v_thread
      )
      on conflict (company_channel_id, external_thread_id) do nothing
      returning id into v_channel_session_id;
    end if;

    return query select v_session.conversation_id, v_channel_session_id, v_thread;
    return;
  end if;

  select a.id into v_assistant_id
  from public.ai_assistant_settings a
  where a.company_id = v_session.company_id
    and a.deleted_at is null
  limit 1;

  if v_assistant_id is null then
    raise exception 'web_chat_unavailable';
  end if;

  v_employee_id := internal.web_chat_widget_employee_id(v_widget.id);

  v_metadata := jsonb_build_object(
    'externalThreadId', v_thread,
    'senderExternalId', v_thread,
    'publicWebChat', true,
    'channelProvider', 'valueor.web_widget',
    'webChatWidgetId', v_widget.id,
    'webChatVisitorSessionId', v_session.id,
    'channelIdentityStatus', 'anonymous_visitor',
    'trustedChannelCustomerId', null
  );

  if v_employee_id is not null then
    select e.id, e.published_version_id, coalesce(nullif(btrim(e.display_name), ''), e.name) as display_name
      into v_employee
    from public.ai_employees e
    where e.id = v_employee_id;

    v_metadata := v_metadata || jsonb_build_object(
      'aiEmployeeId', v_employee.id,
      'aiEmployeeVersionId', v_employee.published_version_id,
      'aiEmployeeDisplayName', v_employee.display_name,
      'aiEmployeeInboundSession', true
    );
  end if;

  insert into public.conversations (
    company_id, ai_assistant_id, channel_type, company_channel_id, external_thread_id, metadata
  ) values (
    v_session.company_id, v_assistant_id, 'web_chat', v_widget.company_channel_id, v_thread, v_metadata
  )
  returning id into v_conversation_id;

  insert into public.channel_sessions (
    company_id, company_channel_id, conversation_id, channel_key, external_thread_id, sender_external_id
  ) values (
    v_session.company_id, v_widget.company_channel_id, v_conversation_id, 'web_chat', v_thread, v_thread
  )
  on conflict (company_channel_id, external_thread_id)
    do update set conversation_id = excluded.conversation_id
  returning id into v_channel_session_id;

  update public.web_chat_visitor_sessions s
  set conversation_id = v_conversation_id,
      last_seen_at = now()
  where s.id = v_session.id;

  return query select v_conversation_id, v_channel_session_id, v_thread;
end;
$$;

create or replace function public.web_chat_public_claim_message(
  p_session_id uuid,
  p_client_message_id text
)
returns table (
  submission_id uuid,
  claimed boolean,
  status text,
  outcome text,
  incoming_message_id uuid
)
language plpgsql
security definer
set search_path = public, internal
as $$
#variable_conflict use_column
declare
  v_company_id uuid;
  v_row public.web_chat_message_submissions%rowtype;
begin
  select s.company_id into v_company_id
  from public.web_chat_visitor_sessions s
  where s.id = p_session_id;

  if v_company_id is null then
    raise exception 'web_chat_unavailable';
  end if;

  insert into public.web_chat_message_submissions (company_id, session_id, client_message_id)
  values (v_company_id, p_session_id, p_client_message_id)
  on conflict on constraint web_chat_message_submissions_unique do nothing
  returning * into v_row;

  if found then
    return query select v_row.id, true, v_row.status, v_row.outcome, v_row.incoming_message_id;
    return;
  end if;

  select * into v_row
  from public.web_chat_message_submissions m
  where m.session_id = p_session_id
    and m.client_message_id = p_client_message_id
  for update;

  -- Retry is only re-claimable after an unexpected failure or a crashed worker.
  if v_row.status = 'failed'
     or (v_row.status = 'processing' and v_row.updated_at < now() - interval '2 minutes') then
    update public.web_chat_message_submissions m
    set status = 'processing', outcome = null
    where m.id = v_row.id
    returning * into v_row;
    return query select v_row.id, true, v_row.status, v_row.outcome, v_row.incoming_message_id;
    return;
  end if;

  return query select v_row.id, false, v_row.status, v_row.outcome, v_row.incoming_message_id;
end;
$$;

create or replace function public.web_chat_public_complete_message(
  p_submission_id uuid,
  p_status text,
  p_outcome text,
  p_incoming_message_id uuid
)
returns void
language sql
security definer
set search_path = public, internal
as $$
  update public.web_chat_message_submissions m
  set status = case when p_status in ('completed', 'failed') then p_status else 'failed' end,
      outcome = left(p_outcome, 40),
      incoming_message_id = coalesce(
        (select cm.id
         from public.conversation_messages cm
         join public.web_chat_visitor_sessions s on s.id = m.session_id
         where cm.id = p_incoming_message_id
           and cm.conversation_id = s.conversation_id),
        m.incoming_message_id
      )
  where m.id = p_submission_id;
$$;

create or replace function public.web_chat_public_record_fallback(
  p_session_id uuid,
  p_client_message_id text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_conversation_id uuid;
  v_id uuid;
  v_external text := 'webchat-fallback:' || p_client_message_id;
begin
  select s.conversation_id into v_conversation_id
  from public.web_chat_visitor_sessions s
  where s.id = p_session_id;

  if v_conversation_id is null
     or p_content is null
     or char_length(btrim(p_content)) = 0
     or char_length(p_content) > 1000 then
    raise exception 'web_chat_unavailable';
  end if;

  insert into public.conversation_messages (
    conversation_id, message_type, content_type, content, status, external_message_id, metadata
  ) values (
    v_conversation_id, 'outgoing', 'text', p_content, 'sent', v_external,
    jsonb_build_object('webChatFallback', true, 'source', 'public_web_chat')
  )
  on conflict (conversation_id, external_message_id) where external_message_id is not null
    do nothing
  returning id into v_id;

  if v_id is null then
    select cm.id into v_id
    from public.conversation_messages cm
    where cm.conversation_id = v_conversation_id
      and cm.external_message_id = v_external;
  end if;

  return v_id;
end;
$$;

create or replace function public.web_chat_public_list_messages(
  p_session_id uuid,
  p_after bigint,
  p_limit integer
)
returns table (
  message_id uuid,
  sequence bigint,
  sender text,
  content text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, internal
as $$
  select cm.id,
         cm.sequence_number,
         case
           when cm.message_type = 'incoming' then 'visitor'
           when cm.metadata ? 'runtimeExecutionId'
             or cm.metadata ? 'automationRunId'
             or cm.metadata ? 'deterministicWelcome'
             or coalesce(cm.metadata->>'webChatFallback', '') = 'true' then 'assistant'
           when cm.created_by is not null then 'agent'
           else 'assistant'
         end,
         cm.content,
         cm.created_at
  from public.web_chat_visitor_sessions s
  join public.conversations c
    on c.id = s.conversation_id
   and c.company_id = s.company_id
   and c.channel_type = 'web_chat'
   and c.deleted_at is null
  join public.web_chat_widgets w
    on w.id = s.widget_id
   and w.company_channel_id = c.company_channel_id
  join public.conversation_messages cm on cm.conversation_id = c.id
  where s.id = p_session_id
    and cm.message_type in ('incoming', 'outgoing')
    and cm.content_type = 'text'
    and not (cm.message_type = 'outgoing' and cm.status = 'failed')
    and char_length(btrim(cm.content)) > 0
    and cm.sequence_number > greatest(coalesce(p_after, 0), 0)
  order by cm.sequence_number asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.web_chat_public_resolve_widget(text)',
    'public.web_chat_public_create_session(uuid, text, text, text, text, integer, integer)',
    'public.web_chat_public_resume_session(uuid, text)',
    'public.web_chat_public_authorize_session(uuid, text)',
    'public.web_chat_public_session_allowed_origins(uuid)',
    'public.web_chat_public_ensure_conversation(uuid)',
    'public.web_chat_public_claim_message(uuid, text)',
    'public.web_chat_public_complete_message(uuid, text, text, uuid)',
    'public.web_chat_public_record_fallback(uuid, text, text)',
    'public.web_chat_public_list_messages(uuid, bigint, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end $$;

-- ── Fail-closed checks ──────────────────────────────────────────────────────

do $$
begin
  if has_function_privilege('anon', 'public.web_chat_public_resolve_widget(text)', 'execute')
     or has_function_privilege('authenticated', 'public.web_chat_public_list_messages(uuid, bigint, integer)', 'execute')
     or has_function_privilege('anon', 'public.web_chat_public_ensure_conversation(uuid)', 'execute') then
    raise exception '400 fail-closed: public web chat RPCs must be service_role only';
  end if;
  if has_table_privilege('anon', 'public.web_chat_message_submissions', 'select')
     or has_table_privilege('anon', 'public.web_chat_visitor_sessions', 'select')
     or has_table_privilege('anon', 'public.web_chat_widgets', 'select') then
    raise exception '400 fail-closed: anon has access to Web Chat tables';
  end if;
  if internal.resolve_channel_commercial_feature_code('web_chat') is not null then
    raise exception '400 fail-closed: web_chat must remain non-commercial';
  end if;
end $$;
