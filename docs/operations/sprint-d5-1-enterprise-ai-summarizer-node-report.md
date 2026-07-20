# Sprint D5.1 — Enterprise AI Summarizer Node

## Summary

Sprint D5.1 delivers the first production-ready AI workflow node built entirely on `@workspace/ai-workflow-platform`. The AI Summarizer executes through the shared execution adapter and Enterprise AI Runtime without duplicating orchestration logic.

## Architecture

```
Workflow Builder (AI Summarizer node)
        ↓
AIWorkflowNodeConfig + summarizer metadata
        ↓
Automation action (ai_workflow / ai.summarizer)
        ↓
AISummarizerNode.prepareConfig + buildPromptContext
        ↓
AIWorkflowExecutionAdapter
        ↓
EnterpriseAIRuntimeService → Prompt Platform → AI Gateway
        ↓
OutputMapperRegistry → workflow variable + __aiLastExecution
```

## Node definition

| Property | Value |
|----------|-------|
| Key | `ai.summarizer` |
| Builder type | `ai_summarizer` |
| Category | AI |
| Default prompt | `workflow_summarize` |
| Default output variable | `summary_result` |
| Capabilities | context, JSON output, optional knowledge |

## Configuration

- Input source: workflow variable or static text
- Prompt template (default `workflow_summarize`, custom selectable)
- Provider / model overrides
- Temperature, max tokens, streaming, policies
- Knowledge toggle (optional)
- Output mode and output variable
- Summary presets: Short, Medium, Detailed, Bullet Points, Executive Summary, Custom
- Summary style, max length, bullet mode, language, tone

Presets map to prompt variables (`summary.style`, `summary.tone`, `summary.maxLength`, etc.) consumed by the Prompt Platform template.

## Prompt Platform

Added library template `workflow_summarize` with summarization sections referencing:

- `{{summary.input}}`
- `{{summary.style}}`, `{{summary.tone}}`, `{{summary.language}}`
- `{{summary.maxLength}}`, `{{summary.bulletMode}}`, `{{summary.instructions}}`

## Runtime metadata

Stored on workflow variables as `__aiLastExecution`:

- executionId, provider, model, prompt version/build
- token usage, latency, estimated cost
- knowledge usage, streaming, output mode, success status

## Observability

Structured events via `AIWorkflowObservability`:

- `node_started`, `prompt_rendered`, `gateway_started`, `gateway_completed`, `node_completed`, `node_failed`

## Workflow Builder

- AI Summarizer appears in the **AI** palette category
- Property editor composes `AIWorkflowConfigPanel` + summary options + validation + preview
- Engine config persists as `action: "ai_workflow"` with embedded `aiConfig`

## Runtime wiring

Opt-in automation registry wrapper:

- `createAutomationRegistryWithAIWorkflow()` in login-app
- `createAutomationPlatformServices(client, { registry })` accepts custom node registry

## Tests

```bash
pnpm --dir lib/ai-workflow-platform test
pnpm --dir lib/ai-prompt-orchestrator test
```

## Success criteria

- Users can drag **AI Summarizer** into a workflow from the AI palette
- Execution flows entirely through the AI Workflow Framework and Enterprise AI Runtime
- Prompt rendering, gateway communication, and output mapping reuse existing platform services
- No duplicated orchestration logic inside the summarizer node implementation
