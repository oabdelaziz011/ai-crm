# Technical Debt Register

**Status:** Informational — future implementation only  
**Last updated:** 2026-07-18  
**Governance:** Items listed here must not expand the scope of active increments unless explicitly approved.

---

## Knowledge Foundation (Increment 1 follow-ups)

| ID | Item | Context | Priority |
|----|------|---------|----------|
| TD-KF-01 | **Section-aware chunk generation** | Multi-page PDFs create per-page sections, but `KnowledgeChunkService.generateChunksForVersion` merges all section text into a single document-level chunking pass. Future work should chunk per section (or honor section boundaries) for finer retrieval granularity. | Medium |
| TD-KF-02 | **Checksum-based document deduplication** | Identical PDF uploads create separate draft documents with the same checksum. Future work should define dedup policy (e.g. `(company_id, source_id, checksum)` upsert vs. explicit duplicate rejection). | Medium |
| TD-KF-03 | **Asynchronous import job tracking** | Import status is stored in `knowledge_documents.metadata.import`. Future work should add a dedicated job queue/table for long-running imports, progress, and failure recovery. | Low |
| TD-KF-04 | **Lazy loading of the PDF parser** | `pdfjs-dist` is bundled into the login-app knowledge chunk (~500 KB). Future work should dynamically import the parser only when a PDF upload is initiated. | Low |
| TD-KF-05 | **Assign `knowledge.*` permissions to seeded demo roles** | Demo seed roles (Beta Admin, Employee) lack `knowledge.view`, `knowledge.manage`, and `knowledge.import`. Future work should assign these to appropriate demo personas for non-super-admin UI testing. | Low |

---

## Embedding Platform (Increment 2 follow-ups)

| ID | Item | Context | Priority |
|----|------|---------|----------|
| TD-EP-01 | **Automatic embedding enqueue after knowledge import** | Increment 2 enqueues embeddings explicitly via `enqueueForVersion`. Future work should hook import completion to queue generation jobs automatically. | Medium |
| TD-EP-02 | **Real adapters for non-OpenAI providers** | Azure OpenAI, Gemini, Cohere, Voyage, and Ollama adapters remain stubs. | Low |
| TD-EP-03 | **Persistent telemetry export** | `EmbeddingTelemetryPort` records in-memory/no-op events. Future work should persist metrics to the AI observability platform. | Low |

---

## Vector Store Platform (Increment 3 follow-ups)

| ID | Item | Context | Priority |
|----|------|---------|----------|
| TD-VS-01 | **Registry collection soft-delete RLS during E2E teardown** | `decommissionCollection` can fail RLS on `vector_collections` for some authenticated contexts; physical pgvector cleanup via RPC succeeds. Future work should align registry delete policies with management service expectations. | Low |
| TD-VS-02 | **Real adapters for non-pgvector providers** | Pinecone, Qdrant, Chroma, and Azure AI Search store/query adapters remain stubs. | Low |
| TD-VS-03 | **Extended metadata filter keys** | Query policy allows generic keys (`document_type`, `language`, …) but indexed vector metadata currently stores embedding fields (`knowledgeChunkId`, `checksum`). Future work should align metadata schema across index and filter policy. | Medium |
| TD-VS-04 | **Bulk vector upsert API** | Large imports index one embedding at a time through `registerIndexedVector`. Future work should add batch upsert for high-volume backfills. | Medium |
| TD-VS-05 | **HNSW index tuning per tenant/collection** | Global HNSW index (`m=16`, `ef_construction=64`) is fixed in migration. Future work should expose tuning or maintenance operations for large corpora. | Low |

---

## Retrieval Engine (Increment 4 follow-ups)

| ID | Item | Context | Priority |
|----|------|---------|----------|
| TD-RE-01 | **Runtime Coordinator query-text wiring** | `RetrievalOrchestrationEngine.retrieveFromQuestion` is complete; Runtime Coordinator still expects precomputed `queryVector`/`embeddingId`. Future increment should pass `messageText` through runtime ports. | Medium |
| TD-RE-02 | **Default retrieval policy seeding** | Demo tenants rely on code defaults or E2E-inserted policies. Seed `is_default` retrieval policies per company in demo migrations. | Low |
| TD-RE-03 | **Dedicated prompt section for knowledge context** | Retrieval chunks map to `systemInstructions[]` via runtime utils. Future work may add a `knowledge_context` prompt section key. | Low |
| TD-RE-04 | **Live OpenAI query embedding in E2E** | E2E uses deterministic mock fetch; live verification requires `OPENAI_API_KEY`. | Low |

---

## Related documentation

- [Knowledge Foundation E2E Report](./knowledge-foundation-e2e-report.md)
- [AI Platform Architecture](./ai-platform.md)
