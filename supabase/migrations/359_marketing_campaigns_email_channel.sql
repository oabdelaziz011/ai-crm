-- Marketing Campaigns — add email as a first-class channel.
-- Additive. SMS remains unsupported. Does not edit 328/329 history.

alter table public.marketing_campaigns
  drop constraint if exists marketing_campaigns_channels_check;

alter table public.marketing_campaigns
  add constraint marketing_campaigns_channels_check
  check (
    cardinality(channels) > 0
    and channels <@ array['whatsapp', 'instagram', 'messenger', 'email']::text[]
  );

alter table public.marketing_campaign_recipients
  drop constraint if exists marketing_campaign_recipients_channel_check;

alter table public.marketing_campaign_recipients
  add constraint marketing_campaign_recipients_channel_check
  check (channel in ('whatsapp', 'instagram', 'messenger', 'email'));

comment on constraint marketing_campaigns_channels_check on public.marketing_campaigns is
  'Campaign channels limited to whatsapp, instagram, messenger, email. SMS is unsupported.';
