-- Sprint 6.2 — Email Platform (provider config + delivery monitoring)
-- Does NOT modify notification_queue schema.

create table if not exists public.company_email_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  smtp_host text not null default '',
  smtp_port integer not null default 587,
  smtp_username text not null default '',
  smtp_password text not null default '',
  smtp_encryption text not null default 'starttls'
    check (smtp_encryption in ('none', 'starttls', 'ssl')),
  from_email text not null default '',
  from_name text not null default '',
  max_retry_count integer not null default 3,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  queue_id uuid references public.notification_queue(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  provider text not null default 'smtp',
  status text not null check (status in ('completed', 'failed')),
  duration_ms integer not null default 0,
  attempts integer not null default 1,
  last_error text,
  recipient_email text,
  subject text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_delivery_logs_company_created
  on public.email_delivery_logs(company_id, created_at desc);

alter table public.company_email_settings enable row level security;
alter table public.email_delivery_logs enable row level security;

drop policy if exists company_email_settings_select on public.company_email_settings;
create policy company_email_settings_select
  on public.company_email_settings for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

drop policy if exists company_email_settings_upsert on public.company_email_settings;
create policy company_email_settings_upsert
  on public.company_email_settings for all
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or (company_id = public.current_company_id() and public.is_company_admin()))
  )
  with check (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or (company_id = public.current_company_id() and public.is_company_admin()))
  );

drop policy if exists email_delivery_logs_select on public.email_delivery_logs;
create policy email_delivery_logs_select
  on public.email_delivery_logs for select
  using (
    auth.role() = 'authenticated'
    and (public.is_super_admin() or company_id = public.current_company_id())
  );

create or replace function public.get_company_email_settings(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.company_email_settings;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin() or p_company_id = public.current_company_id()) then
    raise exception 'Forbidden';
  end if;

  select * into row from public.company_email_settings where company_id = p_company_id;
  if not found then
    return jsonb_build_object(
      'company_id', p_company_id,
      'enabled', false,
      'smtp_host', '',
      'smtp_port', 587,
      'smtp_username', '',
      'smtp_password', '',
      'smtp_encryption', 'starttls',
      'from_email', '',
      'from_name', '',
      'max_retry_count', 3,
      'has_password', false
    );
  end if;

  return jsonb_build_object(
    'company_id', row.company_id,
    'enabled', row.enabled,
    'smtp_host', row.smtp_host,
    'smtp_port', row.smtp_port,
    'smtp_username', row.smtp_username,
    'smtp_password', case when row.smtp_password <> '' then '********' else '' end,
    'smtp_encryption', row.smtp_encryption,
    'from_email', row.from_email,
    'from_name', row.from_name,
    'max_retry_count', row.max_retry_count,
    'has_password', row.smtp_password <> '',
    'updated_at', row.updated_at
  );
end;
$$;

create or replace function public.upsert_company_email_settings(
  p_company_id uuid,
  p_enabled boolean,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_username text,
  p_smtp_password text,
  p_smtp_encryption text,
  p_from_email text,
  p_from_name text,
  p_max_retry_count integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.company_email_settings;
  resolved_password text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin() or (p_company_id = public.current_company_id() and public.is_company_admin())) then
    raise exception 'Forbidden';
  end if;

  select * into existing from public.company_email_settings where company_id = p_company_id;

  resolved_password := coalesce(p_smtp_password, '');
  if resolved_password = '********' and existing.company_id is not null then
    resolved_password := existing.smtp_password;
  end if;

  insert into public.company_email_settings (
    company_id, enabled, smtp_host, smtp_port, smtp_username, smtp_password,
    smtp_encryption, from_email, from_name, max_retry_count, updated_by, updated_at
  ) values (
    p_company_id, p_enabled, p_smtp_host, p_smtp_port, p_smtp_username, resolved_password,
    p_smtp_encryption, p_from_email, p_from_name, greatest(1, least(p_max_retry_count, 10)),
    auth.uid(), now()
  )
  on conflict (company_id) do update set
    enabled = excluded.enabled,
    smtp_host = excluded.smtp_host,
    smtp_port = excluded.smtp_port,
    smtp_username = excluded.smtp_username,
    smtp_password = excluded.smtp_password,
    smtp_encryption = excluded.smtp_encryption,
    from_email = excluded.from_email,
    from_name = excluded.from_name,
    max_retry_count = excluded.max_retry_count,
    updated_by = auth.uid(),
    updated_at = now();

  return public.get_company_email_settings(p_company_id);
end;
$$;

grant execute on function public.get_company_email_settings(uuid) to authenticated;
grant execute on function public.upsert_company_email_settings(uuid, boolean, text, integer, text, text, text, text, text, integer) to authenticated;
