-- Sprint 3: seed AI Employee Email usage metric for ingest_usage_event.

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
  'ai_employee_email',
  'AI Employee Email Replies',
  'One successful AI Employee outbound reply on the Email channel',
  'message',
  'counter',
  true,
  'monthly',
  9,
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

-- Link feature → metric when unset (do not overwrite unrelated links).
update public.feature_definitions
set linked_usage_metric_code = 'ai_employee_email'
where code = 'ai_employee'
  and (
    linked_usage_metric_code is null
    or linked_usage_metric_code = 'ai_employee_email'
  );
