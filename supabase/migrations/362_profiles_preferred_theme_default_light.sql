-- Align profiles.preferred_theme column DEFAULT with app DEFAULT_APP_THEME = 'light'.
-- Does NOT update any existing rows. Existing light/dark/system values stay unchanged.
-- New profiles created without an explicit preferred_theme (e.g. handle_new_user) receive 'light'.

alter table public.profiles
  alter column preferred_theme set default 'light';
