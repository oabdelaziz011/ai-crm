# Vector Store Platform E2E Verification Report

**Generated:** 2026-07-18T04:05:32.494Z
**Target:** [REDACTED]

## Summary

- **Passed:** 7
- **Failed:** 0
- **Total:** 7

### 0. pgvector migration available

- **Result:** PASS
- **Detail:** pgvector_store_collections is reachable


### 1. Collection provisioning

- **Result:** PASS
- **Detail:** collection=94aa9cb2-8a38-4b92-a7a7-5bfa4011d753, provider=pgvector
- **Evidence:**
```json
{
  "collectionId": "94aa9cb2-8a38-4b92-a7a7-5bfa4011d753",
  "collectionName": "e2e-pgvector-1784347526208"
}
```

### 2. Vector persistence (pgvector upsert)

- **Result:** PASS
- **Detail:** indexed=indexed, physicalRow=0cb739b8-bafb-4663-a7a3-e2a0cffa861c
- **Evidence:**
```json
{
  "indexedVectorId": "24c2b4c6-8300-498e-802c-875b87eda026",
  "externalReference": "0cb739b8-bafb-4663-a7a3-e2a0cffa861c",
  "physicalVector": {
    "id": "0cb739b8-bafb-4663-a7a3-e2a0cffa861c",
    "vector_id": "24606a11-3708-4bb0-81ce-c62e40ef1c4a",
    "dimensions": 8,
    "metadata": {
      "checksum": "2e65419898edfd1e223fb02653fd799370680e2cd476b4795f0abed833a0651c",
      "embeddingVersion": 3,
      "knowledgeChunkId": "06e60852-c37a-4fd0-a8d5-e2d5c04fb817"
    }
  }
}
```

### 3. Collection statistics

- **Result:** PASS
- **Detail:** vectorCount=1, dimensions=8, latencyMs=248.35
- **Evidence:**
```json
{
  "stats": {
    "collectionName": "e2e-pgvector-1784347526208",
    "vectorCount": 1,
    "dimensions": 8,
    "providerKey": "pgvector",
    "mock": false
  },
  "statsMs": 248.34950000000026
}
```

### 4. Cosine similarity nearest-neighbor query

- **Result:** PASS
- **Detail:** results=1, latencyMs=1268.08
- **Evidence:**
```json
{
  "executionId": "58e2d476-1d4f-4d27-89b8-24289deb5e81",
  "topHit": {
    "indexedVectorId": "24c2b4c6-8300-498e-802c-875b87eda026",
    "normalizedScore": 1,
    "ranking": 1,
    "metadata": {
      "checksum": "2e65419898edfd1e223fb02653fd799370680e2cd476b4795f0abed833a0651c",
      "provider": "pgvector",
      "knowledgeChunkId": "06e60852-c37a-4fd0-a8d5-e2d5c04fb817",
      "externalReference": "0cb739b8-bafb-4663-a7a3-e2a0cffa861c"
    }
  },
  "queryMs": 1268.0847000000003
}
```

### 5. Metadata filtering

- **Result:** PASS
- **Detail:** filteredResults=0
- **Evidence:**
```json
{
  "executionId": "97cc35d5-071f-4a87-b16d-a054864e5aa6"
}
```

### 6. Vector delete + collection teardown

- **Result:** PASS
- **Detail:** removedStatus=removed, physicalRowAfterDelete=none, teardown=pgvector-rpc
- **Evidence:**
```json
{
  "indexedVectorId": "24c2b4c6-8300-498e-802c-875b87eda026",
  "collectionTeardown": "pgvector-rpc"
}
```

## Performance Observations

- Collection statistics RPC: ~248.35 ms
- Similarity query pipeline: ~1268.08 ms (includes registry + normalization + persistence)

## Known Limitations

1. HNSW index builds asynchronously on large imports; small E2E datasets use exact ordering via `<=>` operator.
2. Metadata filtering uses JSONB containment (`@>`) — partial text or range filters are not supported yet.
3. Non-pgvector vector store providers remain stubs.
4. Retrieval Engine orchestration is out of scope for Increment 3.
