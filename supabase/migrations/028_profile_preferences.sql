-- ============================================================
-- Vault OS – Profile preferences (enterprise profile page)
-- ============================================================

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
