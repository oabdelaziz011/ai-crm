# Sprint W3.1.1 — Startup Dependency Refactor

## Objective

Remove eager PDF.js loading from api-server bootstrap.

## Files changed

| File | Change |
|------|--------|
| `lib/knowledge-platform/package.json` | Added `./repositories` and `./ingestion` subpath exports |
| `lib/knowledge-platform/src/repositories/index.ts` | **New** — repository factories, ports, lifecycle utils |
| `lib/knowledge-platform/src/ingestion/index.ts` | **New** — parser/chunking exports |
| `lib/knowledge-platform/src/index.ts` | Removed ingestion/pdf re-exports from barrel |
| `lib/knowledge-platform/src/ingestion/pdf-parser.ts` | Dynamic `import("pdfjs-dist/...")` inside `parse()` |
| `lib/knowledge-platform/src/ingestion/parser-registry.ts` | Lazy `PdfParser` via dynamic import |
| `lib/embedding-platform/src/index.ts` | Import repository factory from `/repositories` |
| `lib/embedding-platform/src/services/embedding-queue-service.ts` | Import from `/repositories` |
| `lib/embedding-platform/src/services/embedding-document-completion-service.ts` | Import from `/repositories` |
| `lib/embedding-platform/src/services/*.test.ts` | Import types from `/repositories` |

## Dependency graph

### Before

```
api-server bootstrap
└── create-webhook-platform
    └── embedding-platform (barrel)
        └── knowledge-platform (barrel)
            ├── ParserRegistry [static]
            │   └── PdfParser [static]
            │       └── pdfjs-dist [static] → DOMMatrix crash
            └── createSupabaseKnowledgeDocumentRepository
```

### After

```
api-server bootstrap
└── create-webhook-platform
    └── embedding-platform
        └── knowledge-platform/repositories
            └── supabase-knowledge-repositories (no pdfjs)

PDF ingestion (on demand only)
└── knowledge-platform/ingestion
    └── ParserRegistry.parse()
        └── dynamic import("./pdf-parser.js")
            └── dynamic import("pdfjs-dist/...")
```

## Startup verification

| Check | Result | Evidence |
|-------|--------|----------|
| api-server starts | **PASS** | `Server listening port: 3000` — no `DOMMatrix` / `@napi-rs/canvas` warnings |
| Configured port | **PASS** | `PORT=3000` from `.env` |
| `GET /api/healthz` | **PASS** | HTTP 200 `{"status":"ok"}` |
| `GET /api/readyz` | **PASS** | HTTP 200, supabase + platform checks ok |
| `GET /api/webhooks/whatsapp` | **PASS** | HTTP 200, returns verify challenge |
| `POST /api/webhooks/whatsapp` | **PASS** | HTTP 404 `channel_not_found` (expected for empty payload; Express route reached) |
| pdfjs before first PDF | **PASS** | Startup logs contain zero pdf.js warnings; bundle grep shows no eager `DOMMatrix` init path executed |

## Bundle impact

| Metric | Before (W3.1 pre-fix) | After (W3.1.1) |
|--------|-------------------------|----------------|
| `dist/main.mjs` | ~3.6 MB | **3.9 MB** (~4,058,328 bytes) |
| Startup pdfjs execution | **Crash** (`DOMMatrix is not defined`) | **None** |
| pdfjs in bundle | Eagerly evaluated at import | Present but **lazy-loaded** on first PDF parse |

Rebuild command: `pnpm run build` in `artifacts/api-server`.

## Tests

```
lib/knowledge-platform PDF tests: 5/5 PASS
```
