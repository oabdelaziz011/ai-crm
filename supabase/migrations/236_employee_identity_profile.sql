-- Sprint 3.4 — Employee Identity Profile
-- Extend public.profiles only. No new employee tables.
-- job_title already exists (028/029). Add missing identity fields.

alter table public.profiles
  add column if not exists department text,
  add column if not exists phone text,
  add column if not exists bio text,
  add column if not exists extension_number text;

comment on column public.profiles.job_title is
  'Descriptive job title for display only. Never used for authorization.';
comment on column public.profiles.department is
  'Descriptive department label for display only.';
comment on column public.profiles.phone is
  'Employee phone number (identity, not auth).';
comment on column public.profiles.bio is
  'Optional employee bio.';
comment on column public.profiles.extension_number is
  'Optional desk/phone extension for future presence features.';

-- Self-service may update descriptive identity fields (not RBAC).
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Only enforce when the authenticated user is editing their own row.
  if not (old.id = auth.uid() or old.user_id = auth.uid()) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.company_id is distinct from old.company_id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.is_super_admin is distinct from old.is_super_admin
     or new.is_active is distinct from old.is_active
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Cannot modify privileged profile fields';
  end if;

  if not public.is_valid_avatar_url(new.avatar_url) then
    raise exception 'Invalid avatar URL';
  end if;

  return new;
end;
$$;

-- Capture job_title from signup/invite metadata when a profile is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_full_name text;
  v_job_title text;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(split_part(new.email, '@', 1), '')
  );
  v_job_title := nullif(trim(new.raw_user_meta_data->>'job_title'), '');

  insert into public.profiles (id, user_id, email, full_name, role, job_title)
  values (
    new.id,
    new.id,
    new.email,
    v_full_name,
    coalesce(new.raw_user_meta_data->>'role', null),
    v_job_title
  )
  on conflict (id) do update
  set
    user_id = excluded.user_id,
    email = coalesce(public.profiles.email, excluded.email),
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    job_title = coalesce(public.profiles.job_title, excluded.job_title),
    updated_at = now();

  update public.profiles
  set
    id = new.id,
    email = coalesce(email, new.email),
    full_name = coalesce(full_name, v_full_name),
    job_title = coalesce(job_title, v_job_title),
    updated_at = now()
  where user_id = new.id
    and id is distinct from new.id;

  return new;
end;
$$;

-- Extend self-service profile update with identity fields (not roles/permissions).
drop function if exists public.update_my_profile(text, text, text, text, text);

create or replace function public.update_my_profile(
  p_full_name text,
  p_avatar_url text default null,
  p_preferred_language text default 'en',
  p_timezone text default 'UTC',
  p_preferred_theme text default 'system',
  p_job_title text default null,
  p_department text default null,
  p_phone text default null
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
  v_job_title text;
  v_department text;
  v_phone text;
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

  v_phone := nullif(trim(p_phone), '');
  if v_phone is not null and length(v_phone) > 40 then
    raise exception 'Phone is too long';
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
    phone = v_phone,
    updated_at = now()
  where id = v_user_id or user_id = v_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text, text, text, text, text) to authenticated;
