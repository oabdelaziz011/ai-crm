-- Sprint 6 patch: seed AI Email Routing usage metric so ingest_usage_event can resolve it.
-- Idempotent: on conflict do nothing / update linked metric only when null or already matching.

insert into public.usage_metric_definitions (
  code,
  label,
  description,
  unit,
  aggregation_type,
  billable,
  default_period,
  sort_order,
  is_active
)
values (
  'ai_email_routing',
  'AI Email Routing',
  'One inbound email processed by AI Email Routing',
  'message',
  'counter',
  true,
  'monthly',
  8,
  true
)
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description,
  unit = excluded.unit,
  aggregation_type = excluded.aggregation_type,
  billable = excluded.billable,
  default_period = excluded.default_period,
  sort_order = excluded.sort_order,
  is_active = true;

-- Match existing feature ↔ metric linking convention (e.g. whatsapp_channel → whatsapp_messages).
update public.feature_definitions
set linked_usage_metric_code = 'ai_email_routing'
where code = 'ai_email_routing'
  and (
    linked_usage_metric_code is null
    or linked_usage_metric_code = 'ai_email_routing'
  );
