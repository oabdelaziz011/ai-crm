# Embedding Queue Batching Strategy

**Status:** Architecture reference (Increment 2)  
**Last updated:** 2026-07-18

---

## Summary

When callers use **`processBatch`** (recommended for large imports), the queue performs **true multi-input OpenAI embedding requests** — not one HTTP call per chunk. When callers use **`processNext`**, each job triggers a **single-input** request.

---

## API paths

| Method | OpenAI HTTP requests | Inputs per request |
|--------|---------------------|-------------------|
| `jobs.processBatch(ctx, companyId)` | `ceil(claimedJobs / batchSize)` | Up to **16** texts per request |
| `jobs.processNext(ctx, companyId)` | **1** per job | **1** text per request |
| `enqueueForVersion` + manual `processNext` loop | **1** per chunk | **1** text per request |

---

## Constants

Defined in `lib/embedding-platform/src/constants.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_EMBEDDING_BATCH_SIZE` | **16** | Max texts coalesced into one OpenAI `/v1/embeddings` call |
| `DEFAULT_BATCH_PROCESS_LIMIT` | **16** | Max jobs claimed from the queue per `processBatch` invocation |

---

## Large import behavior

Example: a 100-chunk document version after `enqueueForVersion`:

1. **100 jobs** are created in `embedding_jobs` (one per chunk, status `queued`).
2. Each call to `processBatch(ctx, companyId)`:
   - Claims up to **16** queued jobs (FIFO by `queued_at`).
   - Groups them into batches of up to **16**.
   - Calls `OpenAIEmbeddingAdapter.generateEmbeddingsBatch` → **one** OpenAI request with `input: string[]`.
   - Persists each returned vector to `knowledge_embeddings` and marks jobs `completed`.
3. **Minimum OpenAI requests** for 100 chunks: `ceil(100 / 16) = 7` HTTP calls (when using repeated `processBatch` until the queue is empty).
4. **Maximum** if using `processNext` in a loop: **100** HTTP calls.

### Failure handling within batch

If a batch request fails, **all jobs in that batch group** are auto-requeued (or marked `failed` after `max_retries`). Retry uses exponential backoff at the HTTP layer (`fetchWithRetry`) and job-level requeue in `EmbeddingJobService`.

---

## Current limitations

1. **`enqueueForVersion` does not auto-run the queue** — a worker/caller must invoke `processBatch` or `processNext` (see TD-EP-01).
2. **No cross-company batching** — jobs are claimed per `companyId`.
3. **Batch size is fixed at 16** — not yet configurable per connection/provider.
4. **OpenAI is the only provider with native batch API support** — other providers fall back to parallel single-input calls inside `generateForJobsBatch`.

---

## Recommendation for production workers

For large document imports, use:

```typescript
while (true) {
  const completed = await services.jobs.processBatch(ctx, companyId, {
    limit: 16,
    batchSize: 16,
  });
  if (completed.length === 0) break;
}
```

This minimizes OpenAI API calls and aligns with the platform's batching design.
