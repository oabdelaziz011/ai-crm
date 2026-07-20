# Sprint D4 — Enterprise Knowledge Platform (RAG Foundation)

## Summary

Sprint D4 formalizes the existing knowledge/RAG stack into an enterprise Knowledge Platform consumed by AI Runtime exclusively through `KnowledgeProvider`. The implementation extends existing packages rather than introducing parallel systems.

## Architecture

```
Enterprise AI Runtime
        ↓
RuntimeKnowledgePort
        ↓
KnowledgeProvider (retrieval-engine)
        ↓
RetrievalOrchestrationEngine
  → Embedding Platform (provider abstraction)
  → Vector Query Platform
  → Retrieval Engine (selection, budget, assembly)
        ↓
KnowledgeContextProvider (ai-execution-engine)
        ↓
Prompt Platform ({{knowledge.context}} variables)
```

## Existing stack reused

| Package | Role |
|---------|------|
| `@workspace/knowledge-platform` | Repository, ingestion, parsers, chunking, lifecycle, publish |
| `@workspace/embedding-platform` | Embedding generation via provider abstraction |
| `@workspace/vector-store` | Vector storage abstraction (pgvector) |
| `@workspace/vector-query` | Similarity search, policies, ranking |
| `@workspace/retrieval-engine` | Context assembly + **KnowledgeProvider** |
| `@workspace/runtime-integration` | Coordinator retrieval stage + knowledge context mapping |

## D4 additions

### Retrieval engine
- `KnowledgeProvider` — runtime-facing retrieval API
- `KnowledgePolicyRegistry` — max chunks, token budget, ranking strategy
- `KnowledgeRankingRegistry` — similarity / hybrid rankers
- `KnowledgeObservability` — structured retrieval/ingestion events

### AI execution engine
- `KnowledgeContextProvider` — `{{knowledge.context}}`, `{{knowledge.chunkCount}}`
- `RuntimeKnowledgePort` — pluggable knowledge query interface
- Enterprise runtime resolves knowledge via provider or pre-built snapshot

### Knowledge platform
- `ChunkStrategyRegistry` — fixed size, sentence, paragraph, sliding window

### Prompt platform
- `knowledge_context` section key
- Knowledge template variables in renderer catalog

### Runtime integration
- `mapRetrievalSnapshotToKnowledgeContext()` — replaces ad-hoc-only injection path
- Engine ports pass `knowledge` into runtime context (backward-compatible `systemInstructions` retained)
- **api-server parity:** webhook platform wires `retrieval.knowledge` into enterprise runtime; engine ports map retrieval snapshots into `promptContext.knowledge`

### UI
- Knowledge **Retrieval Tester** page (`/dashboard/knowledge/retrieval`)

## Runtime integration flow

1. Coordinator retrieval stage resolves ranked chunks (unchanged)
2. Prompt stage maps retrieval snapshot → `promptContext.knowledge`
3. `EnterpriseAIRuntimeService` merges knowledge through `KnowledgeContextProvider`
4. Optional direct path: runtime `knowledgeQuery` → `KnowledgeProvider.retrieve()`

## Tests

```bash
pnpm --dir lib/retrieval-engine test
pnpm --dir lib/ai-execution-engine test
```

## Success criteria

- Enterprise AI Runtime retrieves knowledge through `KnowledgeProvider` only
- Ingestion, indexing, retrieval, lifecycle, and observability remain independent of workflows and LLM providers
- Switching embedding providers or vector stores requires configuration changes only
- Future AI nodes consume knowledge without implementing retrieval logic

## Out of scope

AI workflow nodes, agent memory, tool/function calling, vision, voice, multi-agent orchestration, autonomous agents
