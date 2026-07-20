# Sprint D5.4 — Enterprise AI Knowledge Search Node

## Summary

Sprint D5.4 adds the **AI Knowledge Search** workflow node (`ai.knowledge_search`). The node retrieves ranked enterprise knowledge through the shared Retrieval Engine and Knowledge Provider without duplicating retrieval orchestration or invoking the LLM gateway.

## Architecture

```
Workflow Builder (query + collection + filters)
        ↓
AIKnowledgeSearchNode (buildKnowledgeRetrievalInput, mapRetrievalResult)
        ↓
AIWorkflowNodeExecutor (retrievalOnly path)
        ↓
Knowledge Provider → Retrieval Engine → Vector Store
        ↓
Structured knowledge_result + __aiLastExecution metadata
```

## Node capabilities

| Item | Value |
|------|-------|
| Key | `ai.knowledge_search` |
| Builder type | `ai_knowledge_search` |
| Default output variable | `knowledge_result` |
| Capability | `retrievalOnly` (skips LLM gateway) |
| Output modes | structured, json, array, text |

## Query sources

Workflow variable, static text, conversation message, decision output, extract output, summarizer output, and custom query.

## Retrieval configuration

Collection, embedding/vector connections, top K, minimum score, max chunks, tags/categories/document type filters, tenant scope, semantic search (hybrid-ready).

## Workflow integration

Structured output exposes:

- `summary` — assembled context text
- `documents` — retrieved document metadata
- `chunks` — ranked chunk content
- `sources` — unique source identifiers
- `metadata` — execution, latency, average similarity

Downstream Summarizer, Decision, and chat nodes can consume these fields directly.

## Observability events

- `knowledge_search_started`
- `retrieval_started`
- `retrieval_completed`
- `results_ranked`
- `knowledge_search_completed`

## Tests

```bash
pnpm --dir lib/ai-workflow-platform typecheck
pnpm --dir lib/ai-workflow-platform test
```

## Success criteria

- Users can drag **AI Knowledge Search** into a workflow
- Retrieval uses the existing Knowledge Provider / Retrieval Engine
- Structured results are available to downstream AI nodes
- No retrieval orchestration logic is duplicated inside the node
