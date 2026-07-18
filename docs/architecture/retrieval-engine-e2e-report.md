# Retrieval Engine E2E Verification Report

**Generated:** 2026-07-18T04:12:02.644Z
**Target:** https://lfbtnskmvibikalsxwsm.supabase.co

## Summary

- **Passed:** 7
- **Failed:** 0
- **Total:** 7

### 1. Question → Query Embedding

- **Result:** PASS
- **Detail:** provider=openai, dimensions=8, latencyMs=253.29
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
- **Detail:** results=1, provider=pgvector, latencyMs=1087.45
- **Evidence:**
```json
{
  "executionId": "293fb8e3-6f82-4071-81ef-91551d51fdaf"
}
```

### 3. Candidate Retrieval

- **Result:** PASS
- **Detail:** chunks=1, vectorQueryExecutionId=9c1bd2b9-82fb-4dcd-8327-e34a1bfc311a
- **Evidence:**
```json
{
  "chunkIds": [
    "f77c1985-844e-477b-92a1-5d923fc69e8c"
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
- **Detail:** totalTokens=18, executionId=0f555d9d-e8d1-4e0b-90cd-c592f59502fe, orchestrationMs=3090
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

- Query embedding generation: ~253.29 ms (mock OpenAI)
- Semantic search execution: ~1087.45 ms
- Full orchestration pipeline: ~3089.94 ms

## Known Limitations

1. E2E uses deterministic mock OpenAI fetch for query embeddings; live OpenAI requires `OPENAI_API_KEY`.
2. Runtime Coordinator and Prompt Orchestrator are not exercised in this increment scope.
3. Threshold scenario depends on vector-query minimum score policy — low-similarity hits may already be excluded upstream.
