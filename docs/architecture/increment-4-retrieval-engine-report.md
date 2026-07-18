# Increment 4 — Retrieval Engine Delivery Report

**Status:** Complete — awaiting architecture review  
**Generated:** 2026-07-18  
**Scope:** End-to-end semantic retrieval orchestration (question → context assembly)

---

## Executive Summary

Increment 4 completes the **Retrieval Engine** by adding **`RetrievalOrchestrationEngine`**, which chains the full semantic retrieval pipeline through existing platform ports:

**Question → Query Embedding (Embedding Platform) → Semantic Search (Vector Query Platform) → Candidate Retrieval → Ranking → Threshold Filtering → Token Budgeting → Context Assembly**

The underlying retrieval engines (selection, budget, assembly, metrics, policy) were already implemented; this increment adds orchestration ports, platform adapters, tests, and live E2E verification — without modifying Runtime Coordinator, Prompt Orchestrator, or OpenAI Chat.

**Unit tests:** 17/17 passed in `@workspace/retrieval-engine`  
**E2E verification:** 7/7 passed against live Supabase

Pre-increment architecture note: [ranking-and-context-assembly-boundaries.md](./ranking-and-context-assembly-boundaries.md)

---

## Architecture Decisions

### 1. Orchestration via dependency-inversion ports

`QueryEmbeddingPort` and `VectorQueryExecutionPort` live in `@workspace/retrieval-engine`. The Retrieval Engine never calls pgvector or OpenAI directly — adapters in `artifacts/login-app/src/lib/retrieval-engine/platform-adapters.ts` delegate to `@workspace/embedding-platform` and `@workspace/vector-query`.

### 2. Ranking boundary preserved

| Layer | Ranking responsibility |
|-------|------------------------|
| **Vector Query Platform** | Similarity score normalization, minimum score threshold, top-K |
| **Retrieval Engine** | Hydrated chunk deduplication, overlap removal, source/department priority, diversity, selection rank |

### 3. Backward-compatible DTOs

- Existing `RetrievalRequest` / `RetrievalResponse` unchanged.
- New `SemanticRetrievalRequest` / `SemanticRetrievalResponse` extend the public contract for end-to-end retrieval.
- `createRetrievalServices()` adds `orchestration` service; existing `retrieval` API unchanged.

### 4. No Runtime Coordinator changes (by scope)

Runtime integration continues to use `runRetrieval` with precomputed vectors. Full question-text wiring deferred to TD-RE-01.

---

## Modified Files

| Area | Files |
|------|-------|
| **Orchestration** | `lib/retrieval-engine/src/engines/retrieval-orchestration-engine.ts` |
| **Ports** | `lib/retrieval-engine/src/ports/query-embedding-port.ts`, `vector-query-execution-port.ts` |
| **DTOs** | `lib/retrieval-engine/src/dto/retrieval-dto.ts` |
| **Factory** | `lib/retrieval-engine/src/index.ts` |
| **Tests** | `lib/retrieval-engine/src/engines/retrieval-orchestration-engine.test.ts` |
| **App adapters** | `artifacts/login-app/src/lib/retrieval-engine/platform-adapters.ts`, `index.ts` |
| **E2E** | `scripts/retrieval-engine-e2e-verify.mts`, `npm run retrieval:e2e` |
| **Docs** | `ranking-and-context-assembly-boundaries.md`, `retrieval-engine-e2e-report.md`, `technical-debt.md` (TD-RE-01..04) |

---

## Test Results

### Unit / integration

```text
pnpm --dir lib/retrieval-engine test      → 17/17 passed
pnpm --dir lib/retrieval-engine typecheck → OK
```

Coverage includes: full orchestration pipeline, metadata filter passthrough, score threshold passthrough, RBAC, existing retrieval engine pipeline tests.

### End-to-end (live Supabase)

```bash
cd artifacts/login-app && npm run retrieval:e2e
# Summary: 7 passed, 0 failed
```

| # | Scenario | Result |
|---|----------|--------|
| 1 | Question → Query Embedding | PASS |
| 2 | Query Embedding → Semantic Search | PASS |
| 3 | Candidate Retrieval | PASS |
| 4 | Ranking | PASS |
| 5 | Threshold filtering | PASS |
| 6 | Token budgeting | PASS |
| 7 | Context assembly | PASS |

Full evidence: [retrieval-engine-e2e-report.md](./retrieval-engine-e2e-report.md)

---

## End-to-End Verification

**Flow verified:**

1. Fixture knowledge chunk indexed in pgvector (8-dim mock-aligned vectors)
2. `generateQueryEmbedding` via Embedding Platform port (mock OpenAI)
3. `executeVectorQuery` via Vector Query Platform → pgvector similarity search
4. `retrieveFromQuestion` → candidate hydration from `knowledge_chunks`
5. Selection rank assigned (`selectionRank=1`)
6. Token budget enforced (`max_context_tokens=120`, `used=18`)
7. Assembled context persisted with document/source references

**Example output:**

- `vectorQueryExecutionId`: linked to completed pgvector query
- `retrieval.executionId`: persisted in `retrieval_executions`
- Context chunk content: *"Enterprise MFA policy requires multi-factor authentication..."*
- `metrics.budgetUsedTokens`: 18

---

## Performance Observations

| Operation | Latency (E2E, remote Supabase) |
|-----------|-------------------------------|
| Query embedding generation | ~250 ms (mock OpenAI) |
| Semantic search (vector query) | ~1,000–1,100 ms |
| Full orchestration pipeline | ~3,000 ms |

Notes:

- Latency dominated by network round-trips and vector query execution persistence.
- Retrieval context assembly (hydration + budget) adds ~1.1 s after vector query completes.
- Single-chunk fixture; multi-chunk corpora not benchmarked.

---

## Known Limitations

1. **Runtime Coordinator not updated** — still expects `queryVector`/`embeddingId`; use `orchestration.retrieveFromQuestion` directly or via future runtime wiring (TD-RE-01).
2. **Prompt Orchestrator not updated** — chunks still map to `systemInstructions[]` at runtime integration layer (TD-RE-03).
3. **E2E uses mock OpenAI** for query embeddings (TD-RE-04).
4. **Threshold scenario** with `minimumScore=0.99` may not reduce results when query vector exactly matches indexed vector (both runs return 1 chunk).
5. **No demo retrieval policy seed** — E2E inserts policy; production tenants fall back to code defaults until seeded (TD-RE-02).
6. **Out of scope (confirmed):** Runtime Coordinator, Prompt Orchestrator, OpenAI Chat, conversation execution, unrelated UI.

---

**Increment 4 is complete. Awaiting architecture review before proceeding.**
