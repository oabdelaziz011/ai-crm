# Sprint D5.0 — Enterprise AI Workflow Framework

## Summary

Sprint D5.0 introduces `@workspace/ai-workflow-platform`, a reusable framework that future AI workflow nodes extend. The framework bridges Workflow Runtime to Enterprise AI Runtime through an execution adapter while keeping the builder independent of runtime internals.

## Architecture

```
Workflow Builder (shared AI property panels)
        ↓
AIWorkflowNodeConfig (shared configuration model)
        ↓
AutomationEngine action node (ai_workflow)
        ↓
AIWorkflowRuntimeBridge / NodeExecutor
        ↓
AIWorkflowExecutionAdapter (port)
        ↓
EnterpriseAIRuntimeService
        ↓
Prompt Platform + AI Gateway + Knowledge (optional)
        ↓
OutputMapperRegistry → typed node output + runtime metadata
```

## Package: `@workspace/ai-workflow-platform`

| Module | Responsibility |
|--------|----------------|
| `BaseAIWorkflowNode` | Configuration, validation, preview, result mapping base class |
| `AINodeRegistry` | Node discovery, categories, icons, capabilities, versioning |
| `AIWorkflowExecutionAdapter` | Workflow → Enterprise AI Runtime bridge (no direct runtime calls from builder) |
| Shared configuration model | Prompt, provider, model, temperature, streaming, knowledge, policies, metadata |
| `OutputMapperRegistry` | Text, JSON, boolean, classification, structured, array |
| `ValidationRegistry` | Prompt, provider, knowledge, output-mode compatibility |
| `AIWorkflowPreviewService` | Builder preview of config, prompt, output schema, knowledge usage |
| Registries bundle | Node, capability, configuration, output mapper, validation |

## Runtime integration

- AI nodes persist as `action: "ai_workflow"` with embedded `aiConfig`
- `wrapActionHandlerWithAIWorkflow()` opt-in wrapper delegates AI actions without breaking existing handlers
- Workflow variables receive mapped output + `__aiLastExecution` metadata (tokens, cost, provider, knowledge usage)

## UI (Workflow Builder)

Shared property panels under `workflow-builder/components/properties/ai/`:

- Prompt selector
- Provider selector
- Model selector
- Temperature slider
- Knowledge toggle
- Output mode selector
- Policy selector
- Preview panel
- Validation panel
- Composed `AIWorkflowConfigPanel`

Hook: `useAIWorkflowPlatformServices()` wires enterprise runtime into the framework factory.

Automation bridge (login-app): `toAIWorkflowAutomationContext()` maps `@workspace/automation-platform` execution contexts into the framework context shape for opt-in runtime wiring.

## Tests

```bash
pnpm --dir lib/ai-workflow-platform test
pnpm --dir lib/ai-workflow-platform typecheck
```

Coverage: configuration round-trip, registries, validation, preview, execution adapter mapping, runtime metadata bridge.

## Out of scope (by design)

No business AI nodes were added (Chat, Intent, Summarizer, Knowledge Search, Vision, Translation, OCR, tool calling, agents). Future sprints register nodes via `registerAIWorkflowNode()` and `BaseAIWorkflowNode`.

## Success criteria

- New AI nodes can be created with minimal code by extending `BaseAIWorkflowNode`
- No duplicated execution logic inside individual nodes — shared adapter handles runtime orchestration
- Workflow Builder configures AI nodes through shared panels without importing Enterprise AI Runtime internals
