# Sprint D1 — Enterprise AI Provider Platform

## Summary

Sprint D1 introduces a provider-independent AI gateway on top of the existing `@workspace/ai-provider-layer` package. The workflow runtime (and future AI nodes) call the gateway — never OpenAI, Anthropic, or Gemini directly. Switching providers requires configuration changes only.

## Architecture

```
Workflow Runtime / Future AI Nodes
          ↓
    AIGatewayService
          ↓
 ProviderConfigurationResolver
          ↓
 EnterpriseAIProvider (Mock | Legacy bridge | future native adapters)
          ↓
 External LLM APIs

Cross-cutting:
  RetryPolicy · CostTracker · UsageTracker · HealthMonitor
```

## Layer separation

| Layer | Path | Responsibility |
|-------|------|----------------|
| Models | `src/models/` | Unified chat, text, embedding request/response types |
| Capabilities | `src/capabilities/` | Provider capability discovery |
| Streaming | `src/streaming/` | Provider-independent stream events |
| Retry | `src/retry/` | Configurable retry/timeout orchestration |
| Metrics | `src/metrics/` | Cost, usage, health monitoring |
| Config | `src/config/` | Default provider, priority, tenant overrides |
| Gateway | `src/gateway/` | Single enterprise entry point |
| Providers | `src/providers/` | Mock provider, enterprise contract, legacy bridge |
| Registry | existing factory + enterprise registry | Dynamic provider resolution |

## EnterpriseAIProvider interface

Supports:
- `chatCompletion` — structured messages + system prompt
- `streamChatCompletion` — incremental stream events
- `generateText` — simple text generation
- `createEmbeddings` — vector output
- `healthCheck` — availability snapshot
- `discoverCapabilities` — chat, streaming, embeddings, vision, JSON, tools

## Registered providers

| Provider | Adapter | Status |
|----------|---------|--------|
| Mock | `mock-provider.ts` | Full enterprise implementation (CI/dev) |
| OpenAI | `openai-chat-adapter.ts` | Real HTTP via legacy bridge |
| Claude | stub + bridge | Configurable stub (swap to native adapter later) |
| Gemini | stub + bridge | Configurable stub |
| Azure OpenAI | stub + bridge | Configurable stub |
| Ollama | stub + bridge | Configurable stub |

## Usage tracking dimensions

Each gateway call records:
- Company / tenant
- Workflow ID
- Execution ID
- Conversation ID
- Input/output tokens, estimated cost, latency

## Configuration

`ProviderConfigurationResolver` supports:
- `defaultProviderKey`
- `defaultModel`
- `providerPriority` fallback order
- Per-provider connection configuration (API keys, base URLs)

## Backward compatibility

Existing `AIProvider` interface, registry service, health service, and Supabase repositories are unchanged. `createAIProviderServices()` now also exposes:
- `gateway`
- `cost`
- `usage`
- `healthMonitor`
- `config`

## Out of scope (as specified)

- Workflow AI nodes
- Prompt templates
- Knowledge base / RAG / embeddings storage
- Vision / function calling implementations

## Tests

```bash
pnpm --dir lib/ai-provider-layer test
```

Covers: gateway chat/stream/embed, mock provider, retry, cost estimation, usage tracking, health monitoring, configuration resolution, capability discovery.

## Success criteria

The workflow runtime can request AI generation through `AIGatewayService` without knowing which provider executes the request. Provider switching is a configuration change, not a runtime code change.
