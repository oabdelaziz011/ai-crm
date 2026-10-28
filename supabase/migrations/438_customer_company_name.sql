/**
 * Migration 438 — Customer organization / employer name (additive, local-safe).
 *
 * Stores the customer's company/organization display name.
 * Distinct from tenant isolation column `company_id`.
 *
 * DO NOT apply to hosted/production without explicit approval.
 */

alter table public.customers
  add column if not exists company_name text;

comment on column public.customers.company_name is
  'Customer organization / employer name. Distinct from tenant company_id.';
