-- Treat all-asterisk / mask+hint values as "keep existing secret" on upsert.
-- whatsapp_mask_secret can return only '*' when hint is empty; the previous
-- regex required 1–8 trailing alphanumerics and would encrypt the mask itself.

create or replace function public.whatsapp_is_unchanged_secret(p_value text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_value, '') = ''
    or p_value = '********'
    or p_value ~ '^\*+$'
    or p_value ~ '^\*+[A-Za-z0-9]{1,8}$';
$$;
