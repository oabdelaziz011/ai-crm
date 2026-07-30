# Retrieval Engine E2E Verification Report

**Generated:** 2026-07-29T18:28:28.940Z
**Target:** https://lfbtnskmvibikalsxwsm.supabase.co

## Summary

- **Passed:** 7
- **Failed:** 0
- **Total:** 7

### 1. Question → Query Embedding

- **Result:** PASS
- **Detail:** provider=openai, dimensions=8, latencyMs=407.80
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
- **Detail:** results=1, provider=pgvector, latencyMs=1688.75
- **Evidence:**
```json
{
  "executionId": "ad00b502-0504-4be6-be93-f616db20284f"
}
```

### 3. Candidate Retrieval

- **Result:** PASS
- **Detail:** chunks=1, vectorQueryExecutionId=c1a1c031-3eb8-4dd8-9506-f66aa603bb4b
- **Evidence:**
```json
{
  "chunkIds": [
    "340ac19c-0342-4455-85f3-c25035a70bc7"
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
- **Detail:** totalTokens=18, executionId=96721dc7-284d-4c12-9950-2fbe4747aee8, orchestrationMs=4447
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

- Query embedding generation: ~407.80 ms (mock OpenAI)
- Semantic search execution: ~1688.75 ms
- Full orchestration pipeline: ~4446.59 ms

## Known Limitations

1. E2E uses deterministic mock OpenAI fetch for query embeddings; live OpenAI requires `OPENAI_API_KEY`.
2. Runtime Coordinator and Prompt Orchestrator are not exercised in this increment scope.
3. Threshold scenario depends on vector-query minimum score policy — low-similarity hits may already be excluded upstream.
