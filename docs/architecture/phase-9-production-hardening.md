# Phase 9 — Production Hardening

## Objective

Prepare the completed Enterprise AI Platform for real production workloads without adding new business features.

## 1. Production Build (Browser Compatibility)

### Problem

login-app bundled `@workspace/channel-platform` and `@workspace/ai-observability` which imported `node:crypto`, breaking Vite production builds.

### Solution

New isomorphic package `@workspace/platform-crypto`:

- `randomUUID()` via Web Crypto
- `sha256Hex()` / `sha256Bytes()` pure JS (no `node:crypto`)
- `hmacSha256Hex()` / `verifyHmacSha256Hex()` for webhook signatures

All platform libs now depend on `@workspace/platform-crypto` instead of `node:crypto`.

```bash
pnpm --dir artifacts/login-app build
pnpm --dir lib/platform-crypto test
```

## 2. Security Hardening

| Control | Implementation |
|---------|----------------|
| Webhook signature validation | `verifyWhatsAppWebhookSignature()` + `x-hub-signature-256` on `POST /api/webhooks/whatsapp/:companyChannelId` |
| Rate limiting | `express-rate-limit` — global 300/min, webhooks 120/min |
| Secret management | `loadPlatformEnv()` requires `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` in production |
| CSP / security headers | `helmet` with CSP, `X-Powered-By` disabled |

Webhook ingress uses **raw body** parsing before JSON middleware to preserve HMAC payload integrity.

Configure WhatsApp `appSecret` in `company_channels.configuration.appSecret`.

Environment:

- `WEBHOOK_REQUIRE_SIGNATURE=true` (default in production)
- `WEBHOOK_EXECUTE_AI=true` (default; set `false` to ingest-only mode)

## 3. Reliability

| Component | Path |
|-----------|------|
| Webhook HTTP ingress | `artifacts/api-server/src/routes/webhooks.ts` |
| Platform bootstrap | `artifacts/api-server/src/platform/create-webhook-platform.ts` |
| Readiness probe | `GET /api/readyz` — Supabase + platform checks |
| Liveness probe | `GET /api/healthz` |
| Embedding worker | `artifacts/platform-worker/src/embedding-worker.ts` |
| Retry / DLQ | Existing `embedding_jobs` retry_count / max_retries + worker alerts |

Run worker:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --dir artifacts/platform-worker start
```

## 4. Performance

| Feature | Implementation |
|---------|----------------|
| Redis caching | `@workspace/platform-cache` — memory fallback, Redis when `REDIS_URL` set |
| Background processing | platform-worker drains `embedding_jobs` in batches |
| Bulk embedding | Existing `EmbeddingJobService.processBatch()` |
| Connection pooling | Supabase client singleton in webhook bootstrap; configure pool via Supabase/PgBouncer |

## 5. Observability

| Feature | Implementation |
|---------|----------------|
| Structured logging | Pino (api-server) + `@workspace/platform-observability` JSON logs |
| Metrics | `PlatformMetricsRegistry` counters |
| Alerting hooks | `registerAlertHook()` / `emitAlert()` |
| OpenTelemetry | `initOpenTelemetry(OTEL_EXPORTER_OTLP_ENDPOINT)` bootstrap hook |

## 6. Load Testing

```bash
node --import tsx/esm scripts/load/production-load-probe.mts
```

Probes concurrent conversation queries, knowledge chunk counts, and queued embedding jobs.

Environment: `LOAD_CONCURRENCY`, `LOAD_COMPANY_LIMIT`.

## 7. CI/CD Readiness

GitHub Actions: `.github/workflows/production-gate.yml`

- platform-crypto tests
- channel-platform tests
- login-app build (validates browser bundle)
- api-server build
- production gate + channel/whatsapp E2E (when Supabase secrets configured)

Expand gate secrets in repository settings for full E2E in CI.

## 8. Backup & Disaster Recovery

See `docs/operations/backup-disaster-recovery.md`.

## Architecture Boundaries (Preserved)

- Webhook ingress → Channel Platform → Runtime Coordinator (when `WEBHOOK_EXECUTE_AI=true`)
- login-app remains a client; server-side webhooks run on api-server
- No new communication channels or business features

## Verification Checklist

- [ ] `pnpm --dir artifacts/login-app build` succeeds
- [ ] `pnpm --dir artifacts/api-server build` succeeds
- [ ] `GET /api/healthz` returns `{ status: "ok" }`
- [ ] `GET /api/readyz` returns `ready` with Supabase configured
- [ ] WhatsApp GET verify + POST with valid signature
- [ ] platform-worker processes queued embedding jobs
- [ ] CI workflow passes on PR

## Stop Condition

Phase 9 complete — proceed to **Production Readiness Review**. No Phase 10 feature work until review approval.
