create or replace function public.whatsapp_verify_token_lookup_hash(p_plaintext text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when p_plaintext is null or length(trim(p_plaintext)) = 0 then ''
    else encode(digest(trim(p_plaintext), 'sha256'), 'hex')
  end;
$$;