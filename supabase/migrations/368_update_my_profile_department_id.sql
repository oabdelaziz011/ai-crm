-- =============================================================================
-- 368 — update_my_profile accepts canonical department_id (Phase 2)
-- =============================================================================
-- Additive RPC change only. Does not alter assignment governance.
-- When p_set_department_membership is true:
--   department_id := p_department_id (nullable clear)
--   department text := organization_departments.name (or null)
-- When false (language/theme persistence):
--   leave department_id unchanged; keep legacy p_department text write
-- =============================================================================

drop function if exists public.update_my_profile(text, text, text, text, text, text, text, text);
drop function if exists internal.update_my_profile(text, text, text, text, text, text, text, text);

create or replace function internal.update_my_profile(
  p_full_name text,
  p_avatar_url text default null,
  p_preferred_language text default 'en',
  p_timezone text default 'UTC',
  p_preferred_theme text default 'system',
  p_job_title text default null,
  p_department text default null,
  p_phone text default null,
  p_department_id uuid default null,
  p_set_department_membership boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path to internal, public
as $$
declare
  v_user_id uuid;
  v_profile public.profiles;
  v_language text;
  v_timezone text;
  v_theme text;
  v_job_title text;
  v_department text;
  v_phone text;
  v_clear_phone boolean := false;
  v_department_id uuid;
  v_department_name text;
  v_company_id uuid;
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

  v_job_title := nullif(trim(p_job_title), '');
  if v_job_title is not null and length(v_job_title) > 120 then
    raise exception 'Job title is too long';
  end if;

  v_department := nullif(trim(p_department), '');
  if v_department is not null and length(v_department) > 120 then
    raise exception 'Department is too long';
  end if;

  if p_phone is null then
    v_phone := null;
    v_clear_phone := false;
  else
    v_phone := nullif(trim(p_phone), '');
    v_clear_phone := true;
    if v_phone is not null and length(v_phone) > 40 then
      raise exception 'Phone is too long';
    end if;
  end if;

  if p_set_department_membership then
    v_department_id := p_department_id;
    if v_department_id is not null then
      select p.company_id into v_company_id
      from public.profiles p
      where p.id = v_user_id or p.user_id = v_user_id
      limit 1;

      if v_company_id is null then
        raise exception 'profiles.department_id requires profiles.company_id';
      end if;

      select d.name
        into v_department_name
      from public.organization_departments d
      where d.id = v_department_id
        and d.company_id = v_company_id;

      if v_department_name is null then
        raise exception 'profiles.department_id must reference a department in the same company';
      end if;
      v_department := v_department_name;
    else
      v_department := null;
    end if;
  end if;

  update public.profiles
  set
    full_name = trim(p_full_name),
    avatar_url = nullif(trim(p_avatar_url), ''),
    preferred_language = v_language,
    timezone = v_timezone,
    preferred_theme = v_theme,
    job_title = v_job_title,
    department = v_department,
    department_id = case
      when p_set_department_membership then v_department_id
      else department_id
    end,
    phone = case
      when v_clear_phone then v_phone
      else phone
    end,
    updated_at = now()
  where id = v_user_id or user_id = v_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$$;

create or replace function public.update_my_profile(
  p_full_name text,
  p_avatar_url text default null,
  p_preferred_language text default 'en',
  p_timezone text default 'UTC',
  p_preferred_theme text default 'system',
  p_job_title text default null,
  p_department text default null,
  p_phone text default null,
  p_department_id uuid default null,
  p_set_department_membership boolean default false
)
returns public.profiles
language sql
security definer
set search_path to public, internal
as $w$
  select internal.update_my_profile(
    p_full_name,
    p_avatar_url,
    p_preferred_language,
    p_timezone,
    p_preferred_theme,
    p_job_title,
    p_department,
    p_phone,
    p_department_id,
    p_set_department_membership
  );
$w$;

revoke all on function public.update_my_profile(
  text, text, text, text, text, text, text, text, uuid, boolean
) from public;
revoke all on function internal.update_my_profile(
  text, text, text, text, text, text, text, text, uuid, boolean
) from public;
grant execute on function public.update_my_profile(
  text, text, text, text, text, text, text, text, uuid, boolean
) to service_role, authenticated;
grant execute on function internal.update_my_profile(
  text, text, text, text, text, text, text, text, uuid, boolean
) to service_role, authenticated;

comment on function public.update_my_profile(
  text, text, text, text, text, text, text, text, uuid, boolean
) is
  'Self-service profile update. When p_set_department_membership is true, department_id is canonical and department text is synced from organization_departments.';
