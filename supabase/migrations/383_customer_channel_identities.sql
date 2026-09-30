/**
 * Migration 383 — Customer channel external identities (Messenger PSID / Instagram IGSID).
 *
 * Additive, local-safe:
 * - company-scoped unique (company_id, channel_key, external_id)
 * - links to customers for CRM resolve-or-create
 * - does NOT store phone/email substitutes for Meta ids
 *
 * DO NOT apply to production without explicit approval.
 */

create table if not exists public.customer_channel_identities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel_key text not null
    check (channel_key in ('messenger', 'instagram')),
  external_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_channel_identities_external_id_nonempty
    check (length(btrim(external_id)) > 0)
);

comment on table public.customer_channel_identities is
  'Company-scoped Messenger PSID / Instagram IGSID → customer mapping. Append/lookup only; never use as phone/email.';

create unique index if not exists idx_customer_channel_identities_unique
  on public.customer_channel_identities (company_id, channel_key, external_id);

create index if not exists idx_customer_channel_identities_customer
  on public.customer_channel_identities (company_id, customer_id);

alter table public.customer_channel_identities enable row level security;

drop policy if exists customer_channel_identities_select on public.customer_channel_identities;
create policy customer_channel_identities_select
  on public.customer_channel_identities
  for select
  using (
    public.is_super_admin()
    or (
      company_id = public.current_company_id()
      and public.user_has_permission('customers.view')
    )
  );

-- Inserts/updates go through service-role webhook identity port (or SECURITY DEFINER helpers).
-- Authenticated clients may select only; no broad insert policies.
revoke all on public.customer_channel_identities from anon, authenticated;
grant select on public.customer_channel_identities to authenticated;
