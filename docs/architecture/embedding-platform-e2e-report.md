# Embedding Platform E2E Verification Report

**Generated:** 2026-07-18T03:53:27.360Z
**Target:** [REDACTED]
**Provider mode:** mock-success

## Summary

- **Passed:** 6
- **Failed:** 0
- **Total:** 6

### 1. Chunk → job enqueue

- **Result:** PASS
- **Detail:** jobs=1, chunks=1
- **Evidence:**
```json
{
  "jobIds": [
    "e54e47cf-1b84-4db4-ba6c-63648744d06f"
  ],
  "chunkIds": [
    "06e60852-c37a-4fd0-a8d5-e2d5c04fb817"
  ]
}
```

### 2. Queue batch execution + persistence

- **Result:** PASS
- **Detail:** completed=1, embeddings=1
- **Evidence:**
```json
{
  "jobs": [
    {
      "id": "e54e47cf-1b84-4db4-ba6c-63648744d06f",
      "status": "completed",
      "result_embedding_id": "8a8f5b36-43c6-4c41-b1c8-6ab4e64557d8"
    }
  ],
  "embeddings": [
    {
      "id": "8a8f5b36-43c6-4c41-b1c8-6ab4e64557d8",
      "chunk_id": "06e60852-c37a-4fd0-a8d5-e2d5c04fb817",
      "status": "active",
      "is_active": true,
      "dimensions": 8,
      "vector_length": 8,
      "mock": false
    }
  ]
}
```

### 3. Provider retry behavior

- **Result:** PASS
- **Detail:** job=2f69c9c8-0d52-427a-b613-08a1e529ea94, status=completed
- **Evidence:**
```json
{
  "telemetry": [
    {
      "companyId": "d0000010-0001-4001-8001-000000000002",
      "providerKey": "openai",
      "model": "text-embedding-3-small",
      "operation": "generate",
      "status": "succeeded",
      "latencyMs": 266,
      "mock": false
    }
  ]
}
```

### 4. Timeout handling

- **Result:** PASS
- **Detail:** status=queued, error=OpenAI embeddings timed out after 50ms.
- **Evidence:**
```json
{
  "errorMessage": "OpenAI embeddings timed out after 50ms."
}
```

### 5. Failure recovery

- **Result:** PASS
- **Detail:** status=completed
- **Evidence:**
```json
{
  "recoveredJobId": "ece18701-c364-412a-affa-95383956cb1b",
  "resultEmbeddingId": "24606a11-3708-4bb0-81ce-c62e40ef1c4a"
}
```

### 6. Execution metrics (telemetry port)

- **Result:** PASS
- **Detail:** events=1
- **Evidence:**
```json
{
  "events": [
    {
      "companyId": "d0000010-0001-4001-8001-000000000002",
      "providerKey": "openai",
      "model": "text-embedding-3-small",
      "operation": "generate_batch",
      "status": "succeeded",
      "latencyMs": 1,
      "batchSize": 1,
      "mock": false
    }
  ]
}
```

## Known Limitations

1. Automatic embedding enqueue after knowledge import is not wired yet — jobs are enqueued explicitly via `enqueueForVersion`.
2. Non-OpenAI embedding adapters remain stubs until future increments.
3. Vector search, pgvector indexing, and retrieval orchestration are out of scope for Increment 2.
4. Live OpenAI verification requires `OPENAI_API_KEY` and `EMBEDDING_E2E_LIVE=true`; default E2E uses deterministic mock fetch.
