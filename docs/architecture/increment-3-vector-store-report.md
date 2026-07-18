# Increment 3 — Vector Store Platform (pgvector) Delivery Report

**Status:** Complete — awaiting architecture review  
**Generated:** 2026-07-18  
**Scope:** pgvector storage, vector persistence, indexes, cosine similarity search, metadata filtering

---

## Executive Summary

Increment 3 replaces the pgvector **stub** adapters in the Vector Store and Vector Query platforms with a **real Supabase/pgvector implementation** while preserving all existing abstractions, service boundaries, and provider factory patterns.

Physical vectors are stored in `pgvector_store_vectors` with an HNSW cosine index. Similarity search runs through `pgvector_similarity_search` RPC and is exposed via the Vector Query Platform provider contract. The Vector Store Platform continues to own persistence (create/delete collection, upsert/delete vector, statistics); search remains exclusively in Vector Query Platform.

**Unit tests:** 32/32 passed (14 vector-store + 18 vector-query)  
**E2E verification:** 7/7 passed against live Supabase (DEMO Beta company)

---

## Pre-Increment 3 Architectural Answer — Embedding Queue Batching

*(Documented in [embedding-platform-batch-strategy.md](./embedding-platform-batch-strategy.md))*

| Path | Behavior |
|------|----------|
| **`processBatch`** | **True batch OpenAI requests** — up to **16** texts per HTTP call via `generateEmbeddingsBatch` |
| **`processNext`** | **One HTTP request per chunk** |
| **Large import (100 chunks)** | Minimum **7** OpenAI calls with repeated `processBatch` (`ceil(100/16)`) |

Constants: `DEFAULT_EMBEDDING_BATCH_SIZE = 16`, `DEFAULT_BATCH_PROCESS_LIMIT = 16`.

---

## Architecture Decisions

### 1. Dual-table model preserved

- **Registry tables** (`vector_collections`, `indexed_vectors`) — unchanged; track logical collections and index state.
- **Physical tables** (`pgvector_store_collections`, `pgvector_store_vectors`) — new; hold actual embeddings.

This keeps Increment 3 scoped to storage/search without modifying Retrieval Engine or Runtime Coordinator.

### 2. Shared storage port

`PgVectorStoragePort` in `@workspace/vector-store` is implemented by:

- `SupabasePgVectorStorage` — production (RPC-backed)
- `InMemoryPgVectorStorage` — unit tests

Vector Query Platform depends on `@workspace/vector-store` for storage reuse; query adapter calls `similaritySearch` on the same port.

### 3. `companyId` via configuration enrichment

Provider DTOs do not include `companyId`. At resolve time, services inject `companyId: connection.company_id` into provider configuration via `enrichProviderConfiguration()`. This avoids DTO boundary changes while enabling tenant isolation in RPCs.

### 4. Search stays in Vector Query Platform

`VectorStoreProvider` contract has **no search methods**. Cosine nearest-neighbor queries are implemented only in `PgVectorQueryAdapter` (`VectorQueryProvider.query`).

### 5. pgvector schema

- Extension: `vector` in `extensions` schema
- Column: `extensions.vector(1536)` with zero-padding for smaller dimensions
- Index: HNSW with `vector_cosine_ops` (`m=16`, `ef_construction=64`)
- Metadata: GIN index on `metadata` jsonb; filters use `@>` containment

### 6. Migration numbering

Migration file: `supabase/migrations/106_pgvector_storage.sql` (renamed from 028/029 to avoid conflicts with existing profile migrations).

---

## Modified Files

| Area | Files |
|------|-------|
| **Migration** | `supabase/migrations/106_pgvector_storage.sql` |
| **Vector Store** | `lib/vector-store/src/providers/pgvector/*`, `stub-adapters.ts`, `factory/vector-store-provider-factory.ts`, `index.ts`, `constants.ts`, `types.ts`, `utils/enrich-provider-configuration.ts`, services (collection, index, registry) |
| **Vector Query** | `lib/vector-query/src/providers/pgvector/pgvector-query-adapter.ts`, `stub-adapters.ts`, `factory/vector-query-provider-factory.ts`, `index.ts`, `types.ts`, `package.json`, `vector-query-provider-registry-service.ts`, `test-utils.ts` |
| **Tests** | `pgvector-adapters.test.ts`, `pgvector-query-adapter.test.ts`, updated platform tests |
| **E2E** | `scripts/vector-store-e2e-verify.mts`, `artifacts/login-app/package.json` |
| **Docs** | `docs/architecture/vector-store-e2e-report.md`, `docs/architecture/technical-debt.md` (TD-VS-01..05) |

---

## Test Results

### Unit / integration

```text
pnpm --dir lib/vector-store test   → 14/14 passed
pnpm --dir lib/vector-query test   → 18/18 passed
```

Coverage includes: collection lifecycle, vector upsert/delete, cosine similarity, metadata filtering, RBAC isolation, provider factory contracts.

### End-to-end (live Supabase)

```bash
cd artifacts/login-app && npm run vector-store:e2e
```

| # | Scenario | Result |
|---|----------|--------|
| 0 | pgvector migration available | PASS |
| 1 | Collection provisioning | PASS |
| 2 | Vector persistence (pgvector upsert) | PASS |
| 3 | Collection statistics | PASS |
| 4 | Cosine similarity nearest-neighbor query | PASS |
| 5 | Metadata filtering | PASS |
| 6 | Vector delete + collection teardown | PASS |

Full evidence: [vector-store-e2e-report.md](./vector-store-e2e-report.md)

---

## End-to-End Verification

**Flow verified:**

1. Authenticate as DEMO platform owner
2. Resolve/create pgvector connection for DEMO Beta company
3. `provisionCollection` → RPC `pgvector_create_collection`
4. `indexEmbedding` → reads `knowledge_embeddings`, calls `pgvector_upsert_vector`
5. Confirm row in `pgvector_store_vectors`
6. `executeQuery` → `pgvector_similarity_search` → normalization → ranked results
7. Metadata filter excludes non-matching documents (`document_type: policy` vs stored embedding metadata)
8. `removeVector` → `pgvector_delete_vector`; collection cleanup via RPC fallback

**DB evidence (example run):**

- Physical vector row created with `dimensions=8`, linked to `knowledge_embeddings.id` as `vector_id`
- Query returned `resultCount=1` with `provider=pgvector`, `mock=false`
- After delete: no row in `pgvector_store_vectors` for the test vector

---

## Performance Observations

| Operation | Latency (E2E, remote Supabase) |
|-----------|-------------------------------|
| Collection statistics RPC | ~250–340 ms |
| Full query pipeline (search + normalize + persist execution) | ~800–1,300 ms |
| Metadata-filtered query (zero hits) | ~800–950 ms |

Notes:

- Small test corpus (1 vector) — HNSW index adds minimal benefit at this scale; query uses `<=>` ordering.
- Latency dominated by network round-trips and query execution persistence, not vector math.
- Bulk import performance not benchmarked; see TD-VS-04 for batch upsert gap.

---

## Known Limitations

1. **Non-pgvector providers remain stubs** (Pinecone, Qdrant, Chroma, Azure AI Search).
2. **Metadata filter keys** in query policy (`document_type`, `language`, …) may not match metadata stored at index time (`knowledgeChunkId`, `checksum`) — filters work at pgvector layer but policy key whitelist may block arbitrary keys.
3. **Maximum dimensions: 1536** — smaller vectors are zero-padded; larger vectors rejected.
4. **No bulk upsert** — each embedding indexed individually through `registerIndexedVector`.
5. **Registry collection delete RLS** — `decommissionCollection` may fail RLS in some contexts; physical pgvector cleanup via RPC succeeds (TD-VS-01).
6. **Retrieval Engine, Runtime Coordinator, Prompt Orchestration, OpenAI Chat** — explicitly out of scope; not modified.

---

## Out of Scope (Confirmed Not Implemented)

- Retrieval Engine changes
- Runtime Coordinator changes
- Prompt Orchestration changes
- OpenAI Chat completions
- UI enhancements unrelated to vector storage

---

**Increment 3 is complete. Awaiting architecture review before Increment 4.**
