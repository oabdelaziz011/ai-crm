# Sprint D5.3 — Enterprise AI Decision & Classification Node

## Summary

Sprint D5.3 adds the **AI Decision** workflow node (`ai.decision`) for classification, routing, scoring, and structured business decisions. The node reuses the Enterprise AI Workflow Framework with no duplicated orchestration logic.

## Architecture

```
Workflow Builder (decision mode + outcome editor + AI config panels)
        ↓
AIDecisionNode (prepareConfig, buildPromptContext, mapResult)
        ↓
AIWorkflowExecutionAdapter
        ↓
Enterprise AI Runtime → Prompt Platform → AI Gateway
        ↓
Decision result validator + confidence policies
        ↓
Workflow variable (decision_result) + __aiLastExecution metadata
```

## Node capabilities

| Item | Value |
|------|-------|
| Key | `ai.decision` |
| Builder type | `ai_decision` |
| Default prompt | `workflow_decision` |
| Default output variable | `decision_result` |
| Output modes | structured, classification, json, boolean, array |

## Decision modes

Intent, category, priority, sentiment, approval, binary, multi-class, confidence scoring, and custom decision modes are supported with mode-specific default outcomes.

## Confidence policies

Configuration-driven policies include minimum confidence threshold, fallback outcome, emit warning, require human review, and continue workflow on low confidence.

## Workflow integration

Structured output exposes:

- `label` — primary decision label for If/Switch routing
- `labels` — multi-label results
- `confidence` — model confidence (0–1)
- `score` — numeric score when applicable
- `metadata` — reasoning, warnings, fallback flags

Downstream nodes can route on `decision_result.value.label` or use classification output mode directly.

## Prompt Platform

Extended `workflow_decision` template with variables:

- `{{decision.input}}`
- `{{decision.mode}}` / `{{decision.modeLabel}}`
- `{{decision.options}}`
- `{{decision.rules}}`
- `{{decision.examples}}`
- `{{decision.confidenceThreshold}}`

## Observability events

- `decision_started`
- `decision_validated`
- plus existing framework events (`node_started`, `prompt_rendered`, `gateway_*`, `node_completed`)

## Tests

```bash
pnpm --dir lib/ai-workflow-platform typecheck
pnpm --dir lib/ai-workflow-platform test
pnpm --dir lib/ai-prompt-orchestrator test
```

## Success criteria

- Users can drag **AI Decision** into a workflow and configure outcomes visually
- Results are validated and immediately consumable by If/Switch/routing nodes
- No duplicated runtime orchestration exists inside the decision node
