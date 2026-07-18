# Backup & Disaster Recovery

## Scope

VaultOS production data lives primarily in **Supabase Postgres** (migrations under `supabase/migrations/`). Application state, conversations, knowledge, billing, and channel configuration are tenant-scoped in Postgres.

## Backup Strategy

| Asset | Method | Frequency | Retention |
|-------|--------|-----------|-----------|
| Supabase Postgres | Supabase automated backups (Pro plan) or `pg_dump` | Daily | 30 days minimum |
| Storage buckets | Supabase Storage replication / export | Daily | 30 days |
| Secrets | Secret manager (not git) | On rotation | Current + 1 prior |
| Migrations | Git repository | Every commit | Indefinite |

### Manual Postgres backup

```bash
pg_dump "$DATABASE_URL" --format=custom --file=vaultos-$(date +%Y%m%d).dump
```

Store dumps encrypted at rest (S3/GCS with SSE, or Supabase backup vault).

## Recovery Objectives

| Tier | RTO | RPO |
|------|-----|-----|
| API + dashboard | 1 hour | 15 minutes |
| Conversations / CRM | 4 hours | 1 hour |
| Knowledge + embeddings | 8 hours | 4 hours |

## Recovery Procedures

### 1. Database restore

1. Pause webhook ingress (`WEBHOOK_EXECUTE_AI=false` on api-server).
2. Stop platform-worker embedding processor.
3. Restore Postgres from latest clean backup.
4. Run `pnpm --filter db push` only if restoring to empty project (greenfield).
5. Verify `/api/readyz` and billing health probe.
6. Re-enable webhooks and workers.

### 2. Partial tenant corruption

1. Identify affected `company_id` from audit logs.
2. Export tenant slice via SQL or admin tooling.
3. Re-seed from last known good backup for that tenant only.
4. Replay channel webhooks only if idempotency keys allow safe replay.

### 3. Secret compromise

1. Rotate `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, WhatsApp tokens, OpenAI keys.
2. Update company channel configurations via Channel Administration.
3. Invalidate active sessions (auth refresh tokens).

## Verification

After any restore:

```bash
pnpm --dir artifacts/login-app production:gate
pnpm --dir artifacts/login-app channel:e2e
pnpm --dir artifacts/login-app whatsapp:e2e
curl -fsS https://<api-host>/api/readyz
```

## Runbook Contacts

Configure `ALERT_WEBHOOK_URL` (optional) to receive platform-worker and api-server critical alerts.
