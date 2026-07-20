# Retrieval Engine E2E Verification Report

**Generated:** 2026-07-19T21:38:01.034Z
**Target:** [REDACTED]

## Summary

- **Passed:** 7
- **Failed:** 0
- **Total:** 7

### 1. Question → Query Embedding

- **Result:** PASS
- **Detail:** provider=openai, dimensions=8, latencyMs=1166.28
- **Evidence:**
```json
{
  "model": "text-embedding-3-small",
  "vectorPreview": [
    1.02,
    1.03,
    1.04,
    1.05
  ]
}
```

### 2. Query Embedding → Semantic Search

- **Result:** PASS
- **Detail:** results=1, provider=pgvector, latencyMs=3049.24
- **Evidence:**
```json
{
  "executionId": "9a5d9d11-04dd-4448-81f0-07a2d2db73b5"
}
```

### 3. Candidate Retrieval

- **Result:** PASS
- **Detail:** chunks=1, vectorQueryExecutionId=ae932ff4-5f7a-428f-802b-3e3f80719bc7
- **Evidence:**
```json
{
  "chunkIds": [
    "f63bbb9d-fb25-4521-91e8-8257b800e535"
  ]
}
```

### 4. Ranking

- **Result:** PASS
- **Detail:** ranks=1
- **Evidence:**
```json
{
  "scores": [
    1
  ]
}
```

### 5. Threshold filtering

- **Result:** PASS
- **Detail:** strictChunks=1, baselineChunks=1


### 6. Token budgeting

- **Result:** PASS
- **Detail:** used=18, budget=120, discarded=0
- **Evidence:**
```json
{
  "metrics": {
    "chunksSelected": 1,
    "chunksRejected": 0,
    "chunksDiscardedBudget": 0,
    "budgetTokens": 120,
    "budgetUsedTokens": 18
  }
}
```

### 7. Context assembly

- **Result:** PASS
- **Detail:** totalTokens=18, executionId=34904002-11ea-44f0-9166-601f3725f60d, orchestrationMs=8848
- **Evidence:**
```json
{
  "chunks": [
    {
      "rank": 1,
      "tokenCount": 18,
      "title": "Enterprise MFA Policy",
      "contentPreview": "Enterprise MFA policy requires multi-factor authentication for all users accessi"
    }
  ]
}
```

## Performance Observations

- Query embedding generation: ~1166.28 ms (mock OpenAI)
- Semantic search execution: ~3049.24 ms
- Full orchestration pipeline: ~8848.98 ms

## Known Limitations

1. E2E uses deterministic mock OpenAI fetch for query embeddings; live OpenAI requires `OPENAI_API_KEY`.
2. Runtime Coordinator and Prompt Orchestrator are not exercised in this increment scope.
3. Threshold scenario depends on vector-query minimum score policy — low-similarity hits may already be excluded upstream.
