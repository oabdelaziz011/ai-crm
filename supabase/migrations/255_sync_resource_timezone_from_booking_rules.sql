-- Resources/branches default to timezone 'UTC', which previously won over company
-- booking rules (e.g. Africa/Cairo) and made WhatsApp display local wall times that
-- did not match CRM instants (+2/+3 hours). Prefer the company's booking-rules TZ
-- when a resource/branch still has the UTC default.

update public.scheduling_resources as r
set
  timezone = br.timezone,
  updated_at = now()
from public.scheduling_booking_rules as br
where br.company_id = r.company_id
  and r.deleted_at is null
  and upper(trim(r.timezone)) = 'UTC'
  and nullif(trim(br.timezone), '') is not null
  and upper(trim(br.timezone)) <> 'UTC';

update public.branches as b
set
  timezone = br.timezone,
  updated_at = now()
from public.scheduling_booking_rules as br
where br.company_id = b.company_id
  and b.deleted_at is null
  and upper(trim(b.timezone)) = 'UTC'
  and nullif(trim(br.timezone), '') is not null
  and upper(trim(br.timezone)) <> 'UTC';
