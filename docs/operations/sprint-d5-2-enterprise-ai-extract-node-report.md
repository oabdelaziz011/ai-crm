# Sprint D5.2 — Enterprise AI Extract Node

## Summary

Sprint D5.2 adds the **AI Extract** workflow node (`ai.extract`) on top of the Enterprise AI Workflow Framework. The node extracts structured business data from unstructured text using schema-driven prompts, validated outputs, and shared runtime orchestration.

## Architecture

```
Workflow Builder (schema builder + AI config panels)
        ↓
AIExtractNode (prepareConfig, buildPromptContext, mapResult)
        ↓
AIWorkflowExecutionAdapter
        ↓
Enterprise AI Runtime → Prompt Platform → AI Gateway
        ↓
Result validator + confidence model
        ↓
Workflow variable (extract_result) + __aiLastExecution metadata
```

## Node capabilities

| Item | Value |
|------|-------|
| Key | `ai.extract` |
| Builder type | `ai_extract` |
| Default prompt | `workflow_extract` |
| Default output variable | `extract_result` |
| Output modes | structured, json, array, text |

## Schema model

Supported field types: string, number, boolean, date, time, email, phone, currency, array, object, enum.

Visual schema builder supports add/rename/delete, required toggle, type selector, description, example value, and enum values.

## Validation layers

1. **Config validation** — schema presence, duplicate names, invalid nesting, input/output variable checks
2. **Result validation** — missing/extra fields, type coercion (`strict`, `coerce`, `lenient`)
3. **Confidence capture** — overall + per-field confidence, warnings, missing values, correction hints

## Prompt Platform

Added `workflow_extract` library template with variables:

- `{{extract.input}}`
- `{{extract.schema}}`
- `{{extract.businessRules}}`
- `{{extract.outputInstructions}}`

## Observability events

- `schema_built`
- `extraction_validated`
- plus existing framework events (`node_started`, `prompt_rendered`, `gateway_*`, `node_completed`)

## Workflow Builder

- AI Extract appears in the **AI** palette
- Property editor includes input source editor, visual schema builder, shared `AIWorkflowConfigPanel`, validation panel, and preview

## Tests

```bash
pnpm --dir lib/ai-workflow-platform test
pnpm --dir lib/ai-prompt-orchestrator test
```

## Success criteria

- Users can drag **AI Extract** into a workflow and define schemas visually
- Downstream nodes consume validated structured output directly
- No duplicated runtime orchestration exists inside the extract node
