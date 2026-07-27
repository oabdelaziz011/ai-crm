-- Persist platform crypto secret for RPC decryption (session settings are not visible to Supabase pool).

create table if not exists public.platform_ai_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_ai_settings enable row level security;

drop policy if exists platform_ai_settings_select on public.platform_ai_settings;
create policy platform_ai_settings_select on public.platform_ai_settings for select using (
  public.is_super_admin()
);

drop policy if exists platform_ai_settings_write on public.platform_ai_settings;
create policy platform_ai_settings_write on public.platform_ai_settings for all using (
  public.is_super_admin()
) with check (public.is_super_admin());

create or replace function public.platform_ai_crypto_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim((select value from public.platform_ai_settings where key = 'crypto_secret' limit 1)), ''),
    nullif(trim(current_setting('app.platform_crypto_key', true)), ''),
    nullif(trim(current_setting('vault.platform_crypto_key', true)), ''),
    nullif(trim(current_setting('app.openai_api_key', true)), ''),
    nullif(trim(current_setting('vault.openai_api_key', true)), '')
  );
$$;

create or replace function public.platform_ai_store_crypto_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'access denied';
  end if;
  if p_secret is null or length(trim(p_secret)) = 0 then
    raise exception 'crypto secret is required';
  end if;
  insert into public.platform_ai_settings(key, value, updated_at)
  values ('crypto_secret', trim(p_secret), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

grant execute on function public.platform_ai_store_crypto_secret(text) to authenticated;
