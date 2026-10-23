-- =============================================================================
-- 433 — Shared WhatsApp conversation turn lease
-- =============================================================================
-- One owner per conversation across API processes. A live owner renews the
-- expiry. After expiry another owner may acquire. Release and renew succeed
-- only for the current owner token.
--
-- This does not make provider delivery exactly-once. A message can still be
-- accepted by the provider before a delivery row is stored.
-- =============================================================================

create table if not exists public.whatsapp_conversation_turn_leases (
  conversation_id uuid primary key,
  owner_token text not null
    constraint whatsapp_conversation_turn_leases_owner_len_chk
      check (char_length(owner_token) between 8 and 128),
  expires_at timestamptz not null,
  acquired_at timestamptz not null default clock_timestamp()
);

comment on table public.whatsapp_conversation_turn_leases is
  'Cross-process WhatsApp turn lease. service_role writes only through the turn RPCs.';

alter table public.whatsapp_conversation_turn_leases enable row level security;

drop policy if exists whatsapp_conversation_turn_leases_deny_all
  on public.whatsapp_conversation_turn_leases;
create policy whatsapp_conversation_turn_leases_deny_all
  on public.whatsapp_conversation_turn_leases
  for all
  using (false)
  with check (false);

revoke all on table public.whatsapp_conversation_turn_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_conversation_turn_leases to service_role;

create or replace function public.acquire_whatsapp_conversation_turn(
  p_conversation_id uuid,
  p_owner text,
  p_ttl_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_conversation_id is null
     or p_owner is null
     or char_length(btrim(p_owner)) < 8
     or char_length(p_owner) > 128 then
    raise exception 'invalid_conversation_turn_lock' using errcode = '22023';
  end if;
  if p_ttl_ms is null or p_ttl_ms < 50 or p_ttl_ms > 300000 then
    raise exception 'invalid_conversation_turn_ttl' using errcode = '22023';
  end if;

  insert into public.whatsapp_conversation_turn_leases (conversation_id, owner_token, expires_at)
  values (
    p_conversation_id,
    p_owner,
    clock_timestamp() + make_interval(secs => p_ttl_ms::double precision / 1000.0)
  )
  on conflict (conversation_id) do update
    set owner_token = excluded.owner_token,
        expires_at = excluded.expires_at,
        acquired_at = clock_timestamp()
    where public.whatsapp_conversation_turn_leases.expires_at <= clock_timestamp()
       or public.whatsapp_conversation_turn_leases.owner_token = excluded.owner_token
  returning conversation_id into v_id;

  return v_id is not null;
end;
$$;

create or replace function public.renew_whatsapp_conversation_turn(
  p_conversation_id uuid,
  p_owner text,
  p_ttl_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_ttl_ms is null or p_ttl_ms < 50 or p_ttl_ms > 300000 then
    raise exception 'invalid_conversation_turn_ttl' using errcode = '22023';
  end if;

  update public.whatsapp_conversation_turn_leases
  set expires_at = clock_timestamp() + make_interval(secs => p_ttl_ms::double precision / 1000.0)
  where conversation_id = p_conversation_id
    and owner_token = p_owner
    and expires_at > clock_timestamp()
  returning conversation_id into v_id;

  return v_id is not null;
end;
$$;

create or replace function public.release_whatsapp_conversation_turn(
  p_conversation_id uuid,
  p_owner text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.whatsapp_conversation_turn_leases
  where conversation_id = p_conversation_id
    and owner_token = p_owner;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

comment on function public.acquire_whatsapp_conversation_turn(uuid, text, integer) is
  'Atomically takes a WhatsApp conversation turn when it is free or expired. Returns false when another live owner holds it.';
comment on function public.renew_whatsapp_conversation_turn(uuid, text, integer) is
  'Extends a WhatsApp turn only while the caller is still the unexpired owner.';
comment on function public.release_whatsapp_conversation_turn(uuid, text) is
  'Deletes a WhatsApp turn lease only when the caller still owns it.';

revoke all on function public.acquire_whatsapp_conversation_turn(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.renew_whatsapp_conversation_turn(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.release_whatsapp_conversation_turn(uuid, text) from public, anon, authenticated;
grant execute on function public.acquire_whatsapp_conversation_turn(uuid, text, integer) to service_role;
grant execute on function public.renew_whatsapp_conversation_turn(uuid, text, integer) to service_role;
grant execute on function public.release_whatsapp_conversation_turn(uuid, text) to service_role;

notify pgrst, 'reload schema';
