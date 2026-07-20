# Sprint D2 — Enterprise Prompt Platform

## Summary

Sprint D2 extends `@workspace/ai-prompt-orchestrator` into a full enterprise Prompt Management Platform. Prompt authoring, rendering, validation, versioning, preview, composition, and runtime execution are separated from workflows and AI providers.

## Architecture

```
Workflow / AI Runtime
        ↓
PromptRuntimeService
        ↓
PromptOrchestratorService
  ├─ Context Providers (customer, company, conversation, workflow, booking, system)
  ├─ PromptRenderer ({{variable}} resolution + escaping)
  ├─ PromptValidator (blocking publish/build rules)
  ├─ PromptComposer (ordered section composition)
  └─ Prompt Metadata Tracker
        ↓
Rendered Prompt Build (prompt_builds)
        ↓
AI Gateway (execution path — unchanged integration)
```

## Layer separation

| Layer | Path | Responsibility |
|-------|------|----------------|
| Rendering | `src/rendering/` | Variable parser, template renderer, token estimation |
| Validation | `src/validation/` | Unknown variables, syntax, length, duplicates |
| Providers | `src/providers/` | Pluggable variable context providers |
| Composition | `src/composition/` | Configurable section ordering |
| Policies | `src/policies/` | Token/temperature/provider/model constraints |
| Metadata | `src/metadata/` | Render size, variable count, estimated tokens, latency |
| Lifecycle | `src/lifecycle/` | Publish validation, compare, rollback, preview |
| Runtime | `src/runtime/` | Render → validate → compose → metadata (optional gateway port) |
| Templates | `src/templates/` | Enterprise preset library (8 templates) |
| Registries | `src/registries/` | Renderer, providers, policies, composers, filters |
| UI | `artifacts/login-app/src/components/prompts/` | Library, editor, preview, validation, version history |

## Enterprise capabilities delivered

1. **Prompt Repository** — existing Supabase tables + template service
2. **Prompt Templates** — 8 reusable presets (support, booking, FAQ, sales, etc.)
3. **Prompt Variables** — `{{customer.name}}`, `{{workflow.input}}`, etc.
4. **Prompt Renderer** — nested objects, arrays, escaping, missing-variable policies
5. **Prompt Preview** — `PromptPreviewService` + UI preview panel
6. **Prompt Validation** — blocking errors before publish
7. **Prompt Versioning** — draft/published/archived lifecycle + rollback
8. **Prompt Composition** — configurable section order (existing + composer registry)
9. **Context Providers** — customer, company, conversation, workflow, booking, system
10. **Prompt Metadata** — execution metadata on builds + tracker
11. **Prompt Policies** — max tokens, temperature, allowed providers/models, JSON mode
12. **Prompt Runtime** — `PromptRuntimeService` orchestrates full pipeline
13. **Extensibility** — registries for renderer, providers, policies, composers, filters
14. **UI** — Prompt Library, Editor, Variable Browser, Preview, Validation, Version History

## Database migration

`supabase/migrations/134_enterprise_prompt_platform.sql`:
- `has_unpublished_draft` on `prompt_templates`
- `lifecycle_status` + `policies` on `prompt_template_versions`
- `metadata` on `prompt_builds`
- Permissions: `prompts.publish`, `prompts.preview`, `prompts.rollback`

## Public API additions

`createPromptOrchestratorServices()` now exposes:
- `runtime`, `preview`, `publish`, `rollback`, `metadata`, `registries`

## Tests

```bash
pnpm --dir lib/ai-prompt-orchestrator test
```

18 tests covering rendering, validation, preview, lifecycle, policies, template library, and existing orchestrator behavior.

## Success criteria

- Workflows reference prompt templates only — no inline prompt strings in runtime code paths
- Platform renders, validates, versions, previews, and composes prompts automatically
- Prompt changes do not require workflow code changes
- Provider changes do not require prompt changes
- Prompt platform is reusable and independent of workflows and providers

## Out of scope (as specified)

AI workflow nodes, knowledge base, embeddings, RAG, agent memory, tool/function calling, vision, voice
