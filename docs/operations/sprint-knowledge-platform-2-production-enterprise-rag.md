# Sprint Knowledge-Platform-2 — Production Enterprise RAG

Extends the existing Knowledge Platform into production-grade RAG without redesigning Runtime or Agent Runtime.

## Architecture

```
Import (PDF/DOCX/MD/HTML/CSV/TXT)
    ↓
Parser Registry → Sections
    ↓
Configurable Chunking (fixed / paragraph / heading-aware / …)
    ↓
Publish → Embedding Queue (incremental skip by checksum)
    ↓
Background Worker (progress, retry, cancel, resume via locks)
    ↓
pgvector HNSW + knowledge_chunks FTS (tsvector)
    ↓
Retrieval: Vector | Keyword | Hybrid (RRF)
    ↓
Re-rank → Citations + Confidence
    ↓
Runtime KnowledgeContextProvider (unchanged contract: contextText)
```

## Indexing pipeline

1. **Import** — `ParserRegistry` supports PDF, DOCX, Markdown, HTML, CSV, plain text.
2. **Chunk** — per-source config: `{ chunking: { strategy, maxChunkSize, overlap } }`.
3. **Publish** — validates chunks, enqueues embedding jobs.
4. **Incremental** — skips jobs when completed job metadata `chunkChecksum` matches current chunk.
5. **Worker** — `platform-worker/embedding-worker.ts` drains queue with locking (migration 130).
6. **Persist** — `knowledge_embeddings` stores model, dimensions, version, checksum, `created_at`.
7. **FTS** — migration 175 adds `search_vector` + GIN index on `knowledge_chunks`.

## Retrieval pipeline

| Stage | Package | Description |
|-------|---------|-------------|
| Query embed | embedding-platform | OpenAI (production) |
| Vector search | vector-query + pgvector | Top-K, threshold, metadata filters |
| Keyword search | RPC `knowledge_keyword_search` | Postgres FTS |
| Hybrid fusion | retrieval-engine `fuseHybridResults` | Reciprocal Rank Fusion |
| Re-rank | `rerankChunks` | Term overlap + title/heading boost |
| Citations | `buildCitations` | Document, section, page, chunk ID, confidence |
| Context | `formatContextWithCitations` | `[cite-1] Title p.4: excerpt…` |

Default policy: **hybrid** search with **rerank** enabled.

## Citation example

```
[cite-1] Employee Handbook p.4: Business hours are 9 AM to 5 PM weekdays.
  Section: Schedule · Confidence: 87% · chunk: 8f3a…
```

## Chunking strategies

| Strategy | Use case |
|----------|----------|
| `paragraph` | General prose (default) |
| `fixed_size` | Uniform token windows |
| `sliding_window` | Overlap-heavy recall |
| `sentence` | Sentence boundaries |
| `heading_aware` | Markdown/docs with headings |

Configure on source: `configuration.chunking = { strategy: "heading_aware", maxChunkSize: 800, overlap: 100 }`.

## Security

- RLS on all knowledge + embedding tables (tenant scoped).
- `knowledge.view` / `knowledge.publish` / `knowledge.import` RBAC.
- Keyword + ops RPCs enforce `current_company_id()` or super-admin.
- Metadata filters support source/document scoping in retrieval.

## Observability

**AI Operations Center → Knowledge RAG tab**

- Document/chunk/embedding KPIs
- Recent documents with indexing status
- Embedding job queue with progress, retries, failures, latency

## Benchmark notes (unit tests)

- Hybrid RRF merges vector + keyword lists (`rag-pipeline.test.ts`)
- Reranker promotes query-term overlap over raw vector score
- Citation builder attaches confidence scores

Run: `pnpm --dir lib/retrieval-engine test`

## Production readiness

| Item | Status |
|------|--------|
| pgvector + FTS | Migration 175 |
| Real embeddings (OpenAI) | Existing |
| Background indexer | Worker + cancel RPC |
| Hybrid search | Implemented |
| Re-ranking | Heuristic (swap-ready for cross-encoder) |
| Citations + confidence | Implemented |
| Incremental re-index | Checksum skip in queue |
| Ops Knowledge tab | Implemented |
| Apply migration 175 | Required |

## Document types

| Type | Parser |
|------|--------|
| PDF | pdf-parser |
| DOCX | docx (XML text extract) |
| Markdown | markdown |
| HTML | html strip |
| CSV | csv rows |
| TXT | plain text |

Future-ready: `metadata.ocr_ready` on DOCX parser for OCR pipeline extension.
