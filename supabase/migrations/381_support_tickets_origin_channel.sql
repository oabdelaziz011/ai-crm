-- Stamp the originating customer channel on support tickets (email / whatsapp / messenger / …).
-- Channel remains logical SMS/Email/WhatsApp identity; this is denormalized for inbox display + close notify.

alter table public.support_tickets
  add column if not exists origin_channel text;

comment on column public.support_tickets.origin_channel is
  'Customer channel that opened the ticket (whatsapp, email, messenger, instagram, sms, web, voice).';

-- Backfill from linked conversation
update public.support_tickets t
set origin_channel = nullif(trim(c.channel_type), '')
from public.conversations c
where t.conversation_id = c.id
  and t.origin_channel is null
  and nullif(trim(c.channel_type), '') is not null;

-- Backfill from metadata when conversation channel missing
update public.support_tickets
set origin_channel = coalesce(
  nullif(trim(metadata->>'channelKey'), ''),
  nullif(trim(metadata->>'originChannel'), ''),
  case
    when nullif(trim(metadata->>'source'), '') in (
      'email', 'whatsapp', 'messenger', 'instagram', 'sms', 'web', 'voice'
    ) then nullif(trim(metadata->>'source'), '')
    else null
  end
)
where origin_channel is null
  and metadata is not null;

create index if not exists support_tickets_origin_channel_idx
  on public.support_tickets (company_id, origin_channel)
  where deleted_at is null and origin_channel is not null;
