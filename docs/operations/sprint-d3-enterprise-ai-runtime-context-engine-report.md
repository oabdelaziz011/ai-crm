# Sprint D3 — Enterprise AI Runtime & Context Engine

## Summary

Sprint D3 introduces `EnterpriseAIRuntimeService` as the single orchestration layer for AI execution. All prompt rendering and gateway calls flow through this runtime. Workflows, channels, and assistants reach AI only via runtime engine ports — never directly through the Prompt Platform or AI Gateway.

## Architecture

```
Workflow / Channel / API / Assistant
              ↓
EnterpriseRuntimeCoordinator (runtime-integration)
              ↓
Runtime Engine Ports
              ↓
EnterpriseAIRuntimeService
  ├─ ContextBuilder + Context Providers
  ├─ ConversationWindowManager
  ├─ ContextPolicyRegistry
  ├─ TokenBudgetManager
  ├─ Runtime Hooks + Middleware
  ├─ Runtime Cache
  ├─ PromptRuntimePort → Prompt Platform
  ├─ RuntimeGatewayPort → AI Gateway
  ├─ ExecutionSessionService
  └─ RuntimeObservability
              ↓
Unified AI Execution Result
```

## Package: `@workspace/ai-execution-engine`

| Module | Responsibility |
|--------|----------------|
| `runtime/enterprise-ai-runtime-service.ts` | Main orchestration pipeline |
| `context/` | Context builder, providers, policies, conversation window, token budget |
| `hooks/` | Lifecycle hooks (before/after context, prompt, gateway, onError) |
| `middleware/` | Configurable middleware pipeline |
| `cache/` | Optional execution cache with TTL |
| `observability/` | Structured runtime events and summaries |
| `registries/` | Provider, policy, hook, middleware, cache registries |
| `ports/` | Prompt + gateway port interfaces |
| `errors/runtime-errors.ts` | Typed runtime errors |

## Wiring

- `createAIExecutionServices(client, integrations?)` creates enterprise runtime when prompt + gateway adapters are injected
- Login app: `useAIExecutionServices()` wires `PromptRuntimeService` + `AIGatewayService` via `runtime-adapters.ts`
- API server: `create-webhook-platform.ts` uses the same adapter pattern
- Engine ports route `prompt.buildPrompt` and `execution.execute` through `EnterpriseAIRuntimeService`

## Backward compatibility

- Legacy `AIExecutionService` remains available for direct execution paths and tests
- Production runtime integration prefers enterprise runtime when integrations are configured
- No breaking changes to coordinator stage contracts

## UI

- `/dashboard/ai-runtime` — read-only runtime monitor (sessions, observability summary, cache hit ratio)

## Tests

```bash
pnpm --dir lib/ai-execution-engine test
```

Covers enterprise orchestration, prompt-build gateway path, conversation window trimming, token budget enforcement, and observability events.

## Success criteria

- Every AI execution flows through `EnterpriseAIRuntimeService`
- Workflows and channels do not call Prompt Platform or AI Gateway directly
- Runtime orchestrates context, prompt rendering, gateway execution, streaming hooks, middleware, policies, and observability through one extensible pipeline
- Future Knowledge, Memory, AI Nodes, and Agent capabilities can plug into registries without redesigning orchestration

## Out of scope

Knowledge base, embeddings, vector search, RAG, AI workflow nodes, tool/function calling, vision, voice, long-term agent memory
