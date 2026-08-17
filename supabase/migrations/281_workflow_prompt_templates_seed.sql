-- Seed system workflow prompt templates expected by AI workflow node defaults.
-- Safe / idempotent: skips keys that already exist as system templates.

insert into public.prompt_templates (
  key,
  display_name,
  description,
  template_type,
  section_order,
  is_enabled
)
select seed.key, seed.display_name, seed.description, seed.template_type, seed.section_order, seed.is_enabled
from (
  values
    (
      'workflow_decision',
      'Workflow Decision',
      'Decision prompts for workflow branching and classification.',
      'classification',
      '["system_instructions","intent_decision","output_contract"]'::jsonb,
      true
    ),
    (
      'workflow_summarize',
      'Workflow Summarize',
      'Summarize workflow text with configurable style, tone, and length.',
      'summarization',
      '["system_instructions","knowledge_context","output_contract"]'::jsonb,
      true
    ),
    (
      'workflow_extract',
      'Workflow Extract',
      'Extract structured business data from unstructured workflow input.',
      'extraction',
      '["system_instructions","knowledge_context","output_contract"]'::jsonb,
      true
    )
) as seed(key, display_name, description, template_type, section_order, is_enabled)
where not exists (
  select 1
  from public.prompt_templates existing
  where existing.company_id is null
    and existing.key = seed.key
);

insert into public.prompt_template_versions (
  template_id,
  version_number,
  version_label,
  sections,
  output_contract,
  change_notes,
  is_active,
  lifecycle_status
)
select
  pt.id,
  1,
  '1.0.0',
  case pt.key
    when 'workflow_decision' then jsonb_build_object(
      'system_instructions', jsonb_build_object(
        'enabled', true,
        'title', 'Decision Instructions',
        'content', 'Make a structured business decision for {{company.name}}.

Input:
{{decision.input}}

Decision mode: {{decision.modeLabel}}

Possible outcomes:
{{decision.options}}

Business rules:
{{decision.rules}}

Examples:
{{decision.examples}}

Minimum confidence threshold: {{decision.confidenceThreshold}}'
      ),
      'intent_decision', jsonb_build_object(
        'enabled', true,
        'title', 'Decision Criteria',
        'content', 'Choose the single best matching outcome label from the configured options. Use only evidence present in the input.'
      ),
      'output_contract', jsonb_build_object(
        'enabled', true,
        'title', 'Output Contract',
        'content', 'Return JSON with shape {"label": "outcome_label", "labels": ["outcome_label"], "confidence": 0.0, "score": null, "reasoning": "short explanation", "metadata": {}}.'
      )
    )
    when 'workflow_summarize' then jsonb_build_object(
      'system_instructions', jsonb_build_object(
        'enabled', true,
        'title', 'Summarization Instructions',
        'content', 'Summarize the following input for {{company.name}}.

Input:
{{summary.input}}

Style: {{summary.style}}
Tone: {{summary.tone}}
Language: {{summary.language}}
Maximum length: {{summary.maxLength}} characters
Bullet mode: {{summary.bulletMode}}
Instructions: {{summary.instructions}}'
      ),
      'output_contract', jsonb_build_object(
        'enabled', true,
        'title', 'Output Contract',
        'content', 'Return only the summary text unless JSON output is requested.'
      )
    )
    when 'workflow_extract' then jsonb_build_object(
      'system_instructions', jsonb_build_object(
        'enabled', true,
        'title', 'Extraction Instructions',
        'content', 'Extract structured business data from the input below for {{company.name}}.

Input:
{{extract.input}}

Schema:
{{extract.schema}}

Business rules:
{{extract.businessRules}}

Output instructions:
{{extract.outputInstructions}}'
      ),
      'output_contract', jsonb_build_object(
        'enabled', true,
        'title', 'Output Contract',
        'content', 'Return JSON with shape {"data": {...}, "confidence": {"overall": 0.0, "fields": {}, "warnings": [], "missingValues": [], "correctionHints": []}}.'
      )
    )
    else '{}'::jsonb
  end,
  jsonb_build_object(
    'format', case when pt.key = 'workflow_summarize' then 'text' else 'json' end,
    'instructions', coalesce(
      (
        case pt.key
          when 'workflow_decision' then 'Return JSON with shape {"label": "outcome_label", "labels": ["outcome_label"], "confidence": 0.0, "score": null, "reasoning": "short explanation", "metadata": {}}.'
          when 'workflow_summarize' then 'Return only the summary text unless JSON output is requested.'
          when 'workflow_extract' then 'Return JSON with shape {"data": {...}, "confidence": {"overall": 0.0, "fields": {}, "warnings": [], "missingValues": [], "correctionHints": []}}.'
          else 'Return a structured response.'
        end
      ),
      'Return a structured response.'
    )
  ),
  'Initial workflow system template version.',
  true,
  'published'
from public.prompt_templates pt
where pt.company_id is null
  and pt.key in ('workflow_decision', 'workflow_summarize', 'workflow_extract')
  and not exists (
    select 1
    from public.prompt_template_versions v
    where v.template_id = pt.id
  );

update public.prompt_templates pt
set active_version_id = v.id
from public.prompt_template_versions v
where pt.company_id is null
  and pt.key in ('workflow_decision', 'workflow_summarize', 'workflow_extract')
  and v.template_id = pt.id
  and v.is_active = true
  and pt.active_version_id is null;
