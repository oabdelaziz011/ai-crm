-- ============================================================
-- Vault OS – Secure self-service profile updates
-- ============================================================

-- Ensure preference columns exist (idempotent with 028)
alter table public.profiles
  add column if not exists job_title text,
  add column if not exists preferred_language text default 'en',
  add column if not exists timezone text default 'UTC';

update public.profiles
set preferred_language = coalesce(preferred_language, 'en')
where preferred_language is null;

update public.profiles
set timezone = coalesce(timezone, 'UTC')
where timezone is null;

-- ── Avatar URL validation (shared by RPC) ───────────────────

create or replace function public.is_valid_avatar_url(p_url text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_url text;
begin
  if p_url is null then
    return true;
  end if;

  v_url := trim(p_url);
  if v_url = '' then
    return true;
  end if;

  if length(v_url) > 750000 then
    return false;
  end if;

  -- Future Supabase Storage object paths (e.g. avatars/{user_id}/photo.jpg)
  if v_url ~ '^avatars/[a-zA-Z0-9/_\-.]+$' then
    return true;
  end if;

  -- Inline image data URLs (legacy / transitional)
  if v_url ~ '^data:image/(jpeg|jpg|png|webp|gif);base64,[a-zA-Z0-9+/=\r\n]+$' then
    return true;
  end if;

  -- HTTPS/HTTP remote URLs
  if v_url ~ '^https?://[^\s<>"{}|\\^`\[\]]+$' then
    return true;
  end if;

  return false;
end;
$$;

-- ── Self-service update RPC ─────────────────────────────────

create or replace function public.update_my_profile(
  p_full_name text,
  p_avatar_url text default null,
  p_preferred_language text default 'en',
  p_timezone text default 'UTC'
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

  update public.profiles
  set
    full_name = trim(p_full_name),
    avatar_url = nullif(trim(p_avatar_url), ''),
    preferred_language = v_language,
    timezone = v_timezone,
    updated_at = now()
  where id = v_user_id or user_id = v_user_id
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;

-- ── Defense-in-depth trigger for self-updates ─────────────────

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
     or new.job_title is distinct from old.job_title
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

drop trigger if exists trg_protect_profile_privileged_columns on public.profiles;
create trigger trg_protect_profile_privileged_columns
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileged_columns();
