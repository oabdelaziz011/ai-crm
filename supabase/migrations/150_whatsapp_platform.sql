-- Sprint 6.3 — WhatsApp Platform (provider config + delivery monitoring)
-- Does NOT modify notification_queue schema.

create table if not exists public.company_whatsapp_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  provider text not null default 'meta_cloud'
    check (provider in ('meta_cloud', 'twilio', '360dialog')),
  access_token text not null default '',
  phone_number_id text not null default '',
  business_account_id text not null default '',
  webhook_verify_token text not null default '',
  default_language text not null default 'en',
  max_retry_count integer not null default 3,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  queue_id uuid references public.notification_queue(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  provider text not null default 'meta_cloud',
  status text not null check (status in ('completed', 'failed')),
  duration_ms integer not null default 0,
  attempts integer not null default 1,
  last_error text,
  recipient_phone text,
  message_id text,
  template_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_delivery_logs_company_created
  on public.whatsapp_delivery_logs(company_id, created_at desc);

alter table public.company_whatsapp_settings enable row level security;
alter table public.whatsapp_delivery_logs enable row level security;

drop policy if exists company_whatsapp_settings_select on public.company_whatsapp_settings;
create policy company_whatsapp_settings_select
  on public.company_whatsapp_settings for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists company_whatsapp_settings_upsert on public.company_whatsapp_settings;
create policy company_whatsapp_settings_upsert
  on public.company_whatsapp_settings for all
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or (company_id = public.current_company_id() and public.is_company_admin()))
  )
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or (company_id = public.current_company_id() and public.is_company_admin()))
  );

drop policy if exists whatsapp_delivery_logs_select on public.whatsapp_delivery_logs;
create policy whatsapp_delivery_logs_select
  on public.whatsapp_delivery_logs for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

create or replace function public.get_company_whatsapp_settings(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_whatsapp_settings;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin() or p_company_id = public.current_company_id()) then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_whatsapp_settings where company_id = p_company_id;
  if not found then
    return jsonb_build_object(
      'company_id', p_company_id,
      'enabled', false,
      'provider', 'meta_cloud',
      'access_token', '',
      'phone_number_id', '',
      'business_account_id', '',
      'webhook_verify_token', '',
      'default_language', 'en',
      'max_retry_count', 3,
      'has_access_token', false,
      'has_webhook_verify_token', false
    );
  end if;

  return jsonb_build_object(
    'company_id', row.company_id,
    'enabled', row.enabled,
    'provider', row.provider,
    'access_token', case when row.access_token <> '' then '********' else '' end,
    'phone_number_id', row.phone_number_id,
    'business_account_id', row.business_account_id,
    'webhook_verify_token', case when row.webhook_verify_token <> '' then '********' else '' end,
    'default_language', row.default_language,
    'max_retry_count', row.max_retry_count,
    'has_access_token', row.access_token <> '',
    'has_webhook_verify_token', row.webhook_verify_token <> '',
    'updated_at', row.updated_at
  );
end;
$$;

create or replace function public.upsert_company_whatsapp_settings(
  p_company_id uuid,
  p_enabled boolean,
  p_provider text,
  p_access_token text,
  p_phone_number_id text,
  p_business_account_id text,
  p_webhook_verify_token text,
  p_default_language text,
  p_max_retry_count integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.company_whatsapp_settings;
  resolved_access_token text;
  resolved_verify_token text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin() or (p_company_id = public.current_company_id() and public.is_company_admin())) then
    raise exception 'Forbidden';
  end if;

  select * into existing from public.company_whatsapp_settings where company_id = p_company_id;

  resolved_access_token := coalesce(p_access_token, '');
  if resolved_access_token = '********' and existing.company_id is not null then
    resolved_access_token := existing.access_token;
  end if;

  resolved_verify_token := coalesce(p_webhook_verify_token, '');
  if resolved_verify_token = '********' and existing.company_id is not null then
    resolved_verify_token := existing.webhook_verify_token;
  end if;

  insert into public.company_whatsapp_settings (
    company_id, enabled, provider, access_token, phone_number_id, business_account_id,
    webhook_verify_token, default_language, max_retry_count, updated_by, updated_at
  ) values (
    p_company_id, p_enabled, p_provider, resolved_access_token, p_phone_number_id,
    p_business_account_id, resolved_verify_token, coalesce(p_default_language, 'en'),
    greatest(1, least(p_max_retry_count, 10)), auth.uid(), now()
  )
  on conflict (company_id) do update set
    enabled = excluded.enabled,
    provider = excluded.provider,
    access_token = excluded.access_token,
    phone_number_id = excluded.phone_number_id,
    business_account_id = excluded.business_account_id,
    webhook_verify_token = excluded.webhook_verify_token,
    default_language = excluded.default_language,
    max_retry_count = excluded.max_retry_count,
    updated_by = auth.uid(),
    updated_at = now();

  return public.get_company_whatsapp_settings(p_company_id);
end;
$$;

grant execute on function public.get_company_whatsapp_settings(uuid) to authenticated;
grant execute on function public.upsert_company_whatsapp_settings(uuid, boolean, text, text, text, text, text, text, integer) to authenticated;
