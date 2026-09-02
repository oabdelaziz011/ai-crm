/**
 * Migration 335 — Campaign recipient delivery reconciliation foundation.
 *
 * Additive only. Does NOT:
 * - change status CHECK (pending|queued|sent|failed|skipped)
 * - weaken RLS
 * - mutate existing recipient rows
 * - execute campaigns / process queue / call Meta
 *
 * Note: provider_message_id already exists from migration 328 (nullable text).
 * This migration adds lifecycle timestamps + company-scoped provider lookup index.
 *
 * Version history: originally drafted as 334 locally; live DB already uses 334 for
 * human_handoff_agent_role_template — this file is intentionally 335.
 *
 * DO NOT apply via supabase db push without explicit approval.
 */

-- ---------------------------------------------------------------------------
-- Lifecycle timestamps (nullable — safe for existing queued recipients)
-- ---------------------------------------------------------------------------
alter table public.marketing_campaign_recipients
  add column if not exists sent_at timestamptz;

alter table public.marketing_campaign_recipients
  add column if not exists delivered_at timestamptz;

alter table public.marketing_campaign_recipients
  add column if not exists read_at timestamptz;

alter table public.marketing_campaign_recipients
  add column if not exists failed_at timestamptz;

alter table public.marketing_campaign_recipients
  add column if not exists replied_at timestamptz;

-- Defensive: ensure provider_message_id exists on older forks (no-op when present).
alter table public.marketing_campaign_recipients
  add column if not exists provider_message_id text;

-- ---------------------------------------------------------------------------
-- Company-scoped provider message lookup (NOT globally unique)
-- ---------------------------------------------------------------------------
create index if not exists idx_marketing_campaign_recipients_company_provider_message
  on public.marketing_campaign_recipients (company_id, provider_message_id)
  where provider_message_id is not null
    and btrim(provider_message_id) <> '';

comment on column public.marketing_campaign_recipients.sent_at is
  'When Meta accepted / outbound submit was confirmed for this recipient (nullable until reconcile).';

comment on column public.marketing_campaign_recipients.delivered_at is
  'When Meta delivered webhook was reconciled for this recipient (nullable).';

comment on column public.marketing_campaign_recipients.read_at is
  'When Meta read webhook was reconciled for this recipient (nullable).';

comment on column public.marketing_campaign_recipients.failed_at is
  'When send or delivery failure was reconciled for this recipient (nullable).';

comment on column public.marketing_campaign_recipients.replied_at is
  'First deterministic quoted-reply attribution timestamp (nullable; never invent).';

comment on column public.marketing_campaign_recipients.provider_message_id is
  'Provider outbound message id (Meta wamid / mid). Set on send reconcile; used for company-scoped webhook lookup.';

comment on index public.idx_marketing_campaign_recipients_company_provider_message is
  'Tenant-scoped provider message lookup for delivery/reply reconcile. Not globally unique.';
