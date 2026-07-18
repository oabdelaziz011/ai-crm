-- ============================================================
-- Vault OS – AI Assistant Settings
-- ============================================================

create table if not exists public.ai_assistant_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assistant_name text not null default 'Vault Assistant',
  assistant_avatar text,
  language text not null default 'en'
    check (language in ('en', 'ar')),
  personality text not null default 'helpful',
  tone text not null default 'friendly'
    check (tone in ('friendly', 'professional', 'formal', 'funny')),
  welcome_message text not null default '',
  fallback_message text not null default '',
  working_hours_enabled boolean not null default false,
  allow_auto_booking boolean not null default true,
  allow_reschedule boolean not null default true,
  allow_cancellation boolean not null default true,
  handoff_to_human boolean not null default true,
  knowledge_enabled boolean not null default false,
  remember_conversation boolean not null default true,
  conversation_timeout_minutes integer not null default 30
    check (conversation_timeout_minutes >= 0),
  max_conversation_age integer not null default 1440
    check (max_conversation_age >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id)
);

create index if not exists idx_ai_assistant_settings_company_id
  on public.ai_assistant_settings(company_id);

drop trigger if exists ai_assistant_settings_updated_at on public.ai_assistant_settings;
create trigger ai_assistant_settings_updated_at
  before update on public.ai_assistant_settings
  for each row execute procedure public.set_updated_at();

alter table public.ai_assistant_settings enable row level security;

drop policy if exists ai_assistant_settings_select on public.ai_assistant_settings;
create policy ai_assistant_settings_select
  on public.ai_assistant_settings for select
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or company_id = public.current_company_id()
    )
  );

drop policy if exists ai_assistant_settings_insert on public.ai_assistant_settings;
create policy ai_assistant_settings_insert
  on public.ai_assistant_settings for insert
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

drop policy if exists ai_assistant_settings_update on public.ai_assistant_settings;
create policy ai_assistant_settings_update
  on public.ai_assistant_settings for update
  using (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  )
  with check (
    auth.role() = 'authenticated'
    and (
      public.is_super_admin()
      or (
        company_id = public.current_company_id()
        and public.is_company_admin()
      )
    )
  );

drop policy if exists ai_assistant_settings_delete on public.ai_assistant_settings;
create policy ai_assistant_settings_delete
  on public.ai_assistant_settings for delete
  using (
    auth.role() = 'authenticated'
    and public.is_super_admin()
  );

-- Permissions
insert into public.permissions (code, category, module, action, description)
values
  ('ai_assistant.view', 'AI Assistant', 'AI Assistant', 'View', 'View AI Assistant settings'),
  ('ai_assistant.edit', 'AI Assistant', 'AI Assistant', 'Edit', 'Edit AI Assistant settings')
on conflict (code) do update
set
  category = excluded.category,
  module = excluded.module,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

-- Audit log support
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity_id text;
  v_company_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  v_action := case TG_OP
    when 'INSERT' then 'CREATE'
    when 'UPDATE' then 'UPDATE'
    when 'DELETE' then 'DELETE'
  end;

  v_entity_id := coalesce(new.id, old.id)::text;

  if TG_TABLE_NAME = 'profiles' then
    v_company_id := coalesce(new.company_id, old.company_id);
  elsif TG_TABLE_NAME = 'companies' then
    v_company_id := coalesce(new.id, old.id);
  elsif TG_TABLE_NAME = 'roles' then
    v_company_id := coalesce(new.company_id, old.company_id);
  elsif TG_TABLE_NAME = 'ai_assistant_settings' then
    v_company_id := coalesce(new.company_id, old.company_id);
  else
    v_company_id := public.current_company_id();
  end if;

  if TG_TABLE_NAME = 'customers' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'email', new.email);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'email', old.email),
        'new', jsonb_build_object('name', new.name, 'email', new.email)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'email', old.email);
    end if;
  elsif TG_TABLE_NAME = 'bookings' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('service', new.service, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('service', old.service, 'status', old.status),
        'new', jsonb_build_object('service', new.service, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('service', old.service, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'invoices' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('amount', new.amount, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('amount', old.amount, 'status', old.status),
        'new', jsonb_build_object('amount', new.amount, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('amount', old.amount, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'companies' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'status', new.status);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'status', old.status),
        'new', jsonb_build_object('name', new.name, 'status', new.status)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'status', old.status);
    end if;
  elsif TG_TABLE_NAME = 'profiles' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('email', new.email, 'company_id', new.company_id);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('email', old.email, 'company_id', old.company_id),
        'new', jsonb_build_object('email', new.email, 'company_id', new.company_id)
      );
    else
      v_metadata := jsonb_build_object('email', old.email, 'company_id', old.company_id);
    end if;
  elsif TG_TABLE_NAME = 'roles' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'company_id', new.company_id);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'description', old.description),
        'new', jsonb_build_object('name', new.name, 'description', new.description)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'company_id', old.company_id);
    end if;
  elsif TG_TABLE_NAME = 'permissions' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('code', new.code);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('code', old.code),
        'new', jsonb_build_object('code', new.code)
      );
    else
      v_metadata := jsonb_build_object('code', old.code);
    end if;
  elsif TG_TABLE_NAME = 'plans' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object('name', new.name, 'code', new.code);
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object('name', old.name, 'code', old.code),
        'new', jsonb_build_object('name', new.name, 'code', new.code)
      );
    else
      v_metadata := jsonb_build_object('name', old.name, 'code', old.code);
    end if;
  elsif TG_TABLE_NAME = 'ai_assistant_settings' then
    if TG_OP = 'INSERT' then
      v_metadata := jsonb_build_object(
        'assistant_name', new.assistant_name,
        'language', new.language,
        'tone', new.tone
      );
    elsif TG_OP = 'UPDATE' then
      v_metadata := jsonb_build_object(
        'old', jsonb_build_object(
          'assistant_name', old.assistant_name,
          'language', old.language,
          'tone', old.tone
        ),
        'new', jsonb_build_object(
          'assistant_name', new.assistant_name,
          'language', new.language,
          'tone', new.tone
        )
      );
    else
      v_metadata := jsonb_build_object(
        'assistant_name', old.assistant_name,
        'language', old.language,
        'tone', old.tone
      );
    end if;
  end if;

  insert into public.audit_logs (
    user_id,
    company_id,
    action,
    entity,
    entity_id,
    ip_address,
    metadata,
    created_at
  )
  values (
    auth.uid(),
    v_company_id,
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    public.request_ip_address(),
    v_metadata,
    now()
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_ai_assistant_settings on public.ai_assistant_settings;
create trigger trg_audit_ai_assistant_settings
  after insert or update or delete on public.ai_assistant_settings
  for each row execute procedure public.write_audit_log();
