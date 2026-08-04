-- Profile appearance preference: system | light | dark

alter table public.profiles
  add column if not exists preferred_theme text default 'system';

update public.profiles
set preferred_theme = coalesce(preferred_theme, 'system')
where preferred_theme is null;

drop function if exists public.update_my_profile(text, text, text, text);

create or replace function public.update_my_profile(
  p_full_name text,
  p_avatar_url text default null,
  p_preferred_language text default 'en',
  p_timezone text default 'UTC',
  p_preferred_theme text default 'system'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_profile public.profiles;
  v_language text;
  v_timezone text;
  v_theme text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'Full name is required';
  end if;

  if length(trim(p_full_name)) > 200 then
    raise exception 'Full name is too long';
  end if;

  if not public.is_valid_avatar_url(p_avatar_url) then
    raise exception 'Invalid avatar URL';
  end if;

  v_language := coalesce(nullif(trim(p_preferred_language), ''), 'en');
  if v_language not in ('en', 'ar') then
    raise exception 'Invalid language';
  end if;

  v_timezone := coalesce(nullif(trim(p_timezone), ''), 'UTC');
  if v_timezone !~ '^([A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?|UTC)$' then
    raise exception 'Invalid timezone';
  end if;

  v_theme := coalesce(nullif(trim(p_preferred_theme), ''), 'system');
  if v_theme not in ('system', 'light', 'dark') then
    raise exception 'Invalid theme';
  end if;

  update public.profiles
  set
    full_name = trim(p_full_name),
    avatar_url = nullif(trim(p_avatar_url), ''),
    preferred_language = v_language,
    timezone = v_timezone,
    preferred_theme = v_theme,
    updated_at = now()
  where id = v_user_id or user_id = v_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text, text) to authenticated;

create or replace function public.load_user_auth_context(p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_profile_id uuid;
  v_company_id uuid;
  v_full_name text;
  v_is_super_admin boolean;
  v_preferred_language text;
  v_preferred_theme text;
  v_timezone text;
  v_avatar_url text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if v_user_id is distinct from auth.uid() and not public.is_super_admin() then
    raise exception 'Forbidden';
  end if;

  select
    p.id,
    p.company_id,
    p.full_name,
    coalesce(p.is_super_admin, false),
    p.preferred_language,
    p.preferred_theme,
    p.timezone,
    p.avatar_url
  into
    v_profile_id,
    v_company_id,
    v_full_name,
    v_is_super_admin,
    v_preferred_language,
    v_preferred_theme,
    v_timezone,
    v_avatar_url
  from public.profiles p
  where p.id = v_user_id or p.user_id = v_user_id
  order by case when p.id = v_user_id then 0 else 1 end
  limit 1;

  if v_profile_id is null then
    return jsonb_build_object(
      'profile', null,
      'company', null,
      'roles', '[]'::jsonb,
      'permissions', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile_id,
      'company_id', v_company_id,
      'full_name', v_full_name,
      'is_super_admin', v_is_super_admin,
      'preferred_language', v_preferred_language,
      'preferred_theme', coalesce(v_preferred_theme, 'system'),
      'timezone', coalesce(v_timezone, 'UTC'),
      'avatar_url', v_avatar_url
    ),
    'company', (
      select to_jsonb(row)
      from (
        select
          c.id,
          c.name,
          c.logo_url,
          c.status,
          c.subscription_status,
          c.billing_cycle,
          c.subscription_expires_at
        from public.companies c
        where c.id = v_company_id
      ) row
    ),
    'roles', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'company_id', r.company_id,
            'name', r.name,
            'description', r.description,
            'is_system', r.is_system
          )
          order by r.name nulls last
        )
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = v_profile_id or ur.user_id = v_user_id
      ),
      '[]'::jsonb
    ),
    'permissions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'category', p.category,
            'module', p.module,
            'action', p.action,
            'code', p.code,
            'description', p.description
          )
          order by p.code nulls last
        )
        from (
          select distinct rp.permission_id
          from public.role_permissions rp
          join public.user_roles ur on ur.role_id = rp.role_id
          where ur.user_id = v_profile_id or ur.user_id = v_user_id
          union
          select up.permission_id
          from public.user_permissions up
          where up.user_id = v_profile_id or up.user_id = v_user_id
        ) perm_ids
        join public.permissions p on p.id = perm_ids.permission_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

comment on function public.load_user_auth_context(uuid) is
  'Single-round-trip auth bootstrap: profile (incl. preferences), company, roles, permissions.';
