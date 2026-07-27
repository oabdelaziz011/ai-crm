-- Repair conversation prompt templates: text output contracts, no JSON executor behavior.

update public.prompt_template_versions v
set output_contract = jsonb_build_object(
  'format', 'text',
  'instructions', 'Respond naturally in plain text to the customer.'
)
from public.prompt_templates t
where v.template_id = t.id
  and t.template_type = 'conversation'
  and (
    v.output_contract = '{}'::jsonb
    or coalesce(v.output_contract->>'format', 'json') = 'json'
  );

update public.prompt_builds pb
set output_contract = jsonb_build_object(
  'format', 'text',
  'instructions', 'Respond naturally in plain text to the customer.'
)
where pb.template_type = 'conversation'
  and (
    pb.output_contract = '{}'::jsonb
    or coalesce(pb.output_contract->>'format', 'json') = 'json'
  );
