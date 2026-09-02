-- Marketing Campaigns Phase 2A — multi-channel allow-list (WhatsApp, Instagram, Messenger).
-- Additive. Short-message channel remains unsupported. Do NOT apply via supabase db push without approval.
-- Does not edit migration 328 history.

-- ---------------------------------------------------------------------------
-- Widen marketing_campaigns.channels check
-- ---------------------------------------------------------------------------
alter table public.marketing_campaigns
  drop constraint if exists marketing_campaigns_channels_check;

alter table public.marketing_campaigns
  add constraint marketing_campaigns_channels_check
  check (
    cardinality(channels) > 0
    and channels <@ array['whatsapp', 'instagram', 'messenger']::text[]
  );

-- ---------------------------------------------------------------------------
-- Widen marketing_campaign_recipients.channel check
-- ---------------------------------------------------------------------------
alter table public.marketing_campaign_recipients
  drop constraint if exists marketing_campaign_recipients_channel_check;

alter table public.marketing_campaign_recipients
  add constraint marketing_campaign_recipients_channel_check
  check (channel in ('whatsapp', 'instagram', 'messenger'));

-- ---------------------------------------------------------------------------
-- Persist channel-platform delivery reference (IG / Messenger)
-- ---------------------------------------------------------------------------
alter table public.marketing_campaign_recipients
  add column if not exists channel_delivery_event_id uuid;

create index if not exists idx_marketing_campaign_recipients_delivery_event
  on public.marketing_campaign_recipients(channel_delivery_event_id)
  where channel_delivery_event_id is not null;

comment on column public.marketing_campaign_recipients.channel_delivery_event_id is
  'channel_delivery_events.id for Instagram/Messenger synchronous outbound; null for WhatsApp queue path.';

comment on constraint marketing_campaigns_channels_check on public.marketing_campaigns is
  'Campaign channels limited to whatsapp, instagram, messenger only.';
