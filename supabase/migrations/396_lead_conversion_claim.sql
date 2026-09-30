-- Lead → Customer (+ Opportunity) conversion: server-side concurrency guard.
-- A short-lived claim on the lead row serialises concurrent conversions
-- (double-click, two tabs, retry while the first request is still running).
-- The conversion steps themselves stay in the existing Customer / Opportunity services.

alter table public.leads
  add column if not exists conversion_claim_id uuid,
  add column if not exists conversion_claimed_at timestamptz;

comment on column public.leads.conversion_claim_id is
  'Transient claim held while a Lead conversion is running; cleared on completion. Stale claims expire by TTL.';
comment on column public.leads.conversion_claimed_at is
  'When conversion_claim_id was taken; claims older than the TTL may be re-taken.';

create or replace function public.lead_conversion_try_claim(
  p_company_id uuid,
  p_lead_id uuid,
  p_claim_id uuid,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  if p_company_id is null or p_lead_id is null or p_claim_id is null then
    raise exception 'company, lead and claim ids are required' using errcode = '22023';
  end if;

  if not public.has_company_permission(p_company_id, 'leads.convert') then
    raise exception 'Missing permission: leads.convert' using errcode = '42501';
  end if;

  update public.leads
     set conversion_claim_id = p_claim_id,
         conversion_claimed_at = now()
   where id = p_lead_id
     and company_id = p_company_id
     and deleted_at is null
     and (
       conversion_claim_id is null
       or conversion_claim_id = p_claim_id
       or conversion_claimed_at is null
       or conversion_claimed_at < now() - make_interval(secs => greatest(coalesce(p_ttl_seconds, 120), 10))
     )
  returning conversion_claim_id into v_claimed;

  return v_claimed is not null;
end;
$$;

comment on function public.lead_conversion_try_claim(uuid, uuid, uuid, integer) is
  'Takes the conversion claim on a lead in the caller''s company (requires leads.convert). Returns false when another conversion holds a live claim.';

revoke all on function public.lead_conversion_try_claim(uuid, uuid, uuid, integer) from public;
grant execute on function public.lead_conversion_try_claim(uuid, uuid, uuid, integer) to authenticated, service_role;

create or replace function public.lead_conversion_release_claim(
  p_company_id uuid,
  p_lead_id uuid,
  p_claim_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_company_permission(p_company_id, 'leads.convert') then
    raise exception 'Missing permission: leads.convert' using errcode = '42501';
  end if;

  update public.leads
     set conversion_claim_id = null,
         conversion_claimed_at = null
   where id = p_lead_id
     and company_id = p_company_id
     and conversion_claim_id = p_claim_id;
end;
$$;

comment on function public.lead_conversion_release_claim(uuid, uuid, uuid) is
  'Releases a conversion claim held by p_claim_id (no-op when the claim was already released or taken over).';

revoke all on function public.lead_conversion_release_claim(uuid, uuid, uuid) from public;
grant execute on function public.lead_conversion_release_claim(uuid, uuid, uuid) to authenticated, service_role;
