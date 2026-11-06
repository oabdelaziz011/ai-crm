# Production release preparation

This is the preparation record for commit `0273b2fe` plus local migration `442`.
Nothing in this file is a Production change. Do not apply it to the hosted database or deploy from it.

## Local subscription probe

The browser reads `company_subscriptions` with the signed-in `authenticated` role. Row-level security is on. The select policy requires `authenticated` and `internal.can_view_billing_company(company_id)`. Insert and update policies are the constant `false`.

A fresh local database does not auto-expose tables, so `authenticated` had no table privilege. PostgREST returned `permission denied for table company_subscriptions` before the policy ran. That is an application grant gap, not an RLS defect.

On hosted Production today, the same table still has the older broad grants: `authenticated` can select, insert, update, delete, and truncate; `anon` can select and truncate. RLS remains on. The signed-in query works there because the select grant already exists. Truncate ignores RLS, so those extra grants are the privilege problem migration 441 removes. Migration 442 does not grant insert or update on this table, and it does not grant anything to `anon`.

After 442 on the fresh local database, `authenticated` can select `company_subscriptions`, cannot insert or truncate it, `anon` cannot select it, and RLS stays on. The local runtime probe then passed 19/19. The same probe shape against Production also passed 19/19 as a read-only check.

## Backup and restore

Do this before any hosted migration. Do not restore over Production.

1. In the Supabase dashboard, create an on-demand backup. Record the backup id and the UTC timestamp. This preparation does not have a management token, so that backup is still absent.
2. Confirm the dashboard backup is listed as completed.
3. Keep the logical copy already taken outside the repository:
   - `node scripts/rehearse-production-copy.mjs dump`
   - The file is `%TEMP%\valueor-production-copy.dump` (23,101,520 bytes on this run). It is not in git.
   - Schemas copied: `auth`, `internal`, `public`, `storage`, `supabase_migrations`.
   - The copy omits ACLs (`--no-acl`) so it can be restored without Production role owners. It is not a dashboard point-in-time backup.
4. Restore only into local database `valueor_rehearsal` on `127.0.0.1:54322`:
   - `node scripts/rehearse-production-copy.mjs restore`
   - `node scripts/rehearse-production-copy.mjs migrate`
5. `migrate` runs `supabase migration up --db-url` against that local database with `--include-all`, because version 361 is older than the applied version 372. It refuses a Production URL and `--linked`. Do not insert rows into `supabase_migrations` by hand.
6. A restore is verified only when `pg_restore` exits 0 and `select max(version), count(*) from supabase_migrations.schema_migrations` matches the table above. The logical copy is not a substitute for the dashboard backup.

Verified on this rehearsal, still not on Production:

| Check | Result |
|---|---|
| Database size read from Production | 282 MB |
| History immediately after restore | latest `372`, 314 applied, 166 companies |
| `pg_restore` | exit 0 |
| Migrations applied on the copy | `361`, then `373` through `442` |
| History after migrate | latest `442`, 385 applied, including `361` |
| `company_subscriptions` after 441 and 442 | RLS on; `authenticated` select only; insert, update, and truncate false; `anon` select and truncate false; `service_role` select true |
| Public tables with truncate for `anon` or `authenticated` | 0 of 327 |

The local application database on port 54322, database `postgres`, was not overwritten. The rehearsal database is `valueor_rehearsal`.

## API process

The login app on Vercel is static. The API is a separate Node process.

1. Build with `pnpm --dir artifacts/api-server build`.
2. On the API host, set the production environment from the checklist below. Do not reuse the workstation `.env`.
3. Start with `node scripts/start-production-api.mjs --start` after `node scripts/start-production-api.mjs` prints that the profile passed.
4. Supervise that process so it restarts after exit. Liveness is `GET /api/healthz`. Readiness is `GET /api/readyz` and must report `nodeEnv` of `production` with `supabase` and `platform` checks `ok`.
5. Render the tunnel only after readiness succeeds:
   `PRODUCTION_API_ORIGIN=https://<api-host> node scripts/cloudflare/render-production-tunnel.mjs`
   Then start cloudflared with `CLOUDFLARE_TUNNEL_CONFIG` pointed at the rendered file.
6. `webhook.valueor.org` must reach that origin. `pnpm tunnel:run` refuses loopback for that hostname.
7. The billing lifecycle worker stays off until `BILLING_LIFECYCLE_WORKER_ENABLED=true` and `BILLING_LIFECYCLE_WORKER_CONFIRMED=true`.
8. Run the embedding worker as its own supervised process: `pnpm --dir artifacts/platform-worker start`, after `node scripts/check-production-worker.mjs` passes. `pg_cron` is not installed, so these processes are the schedulers.

## Secrets checklist

Set these on the API host. Do not commit values. Empty and `dev-secret-change-me`, `dev-internal-api-key`, and `dev-secret` are rejected.

`node scripts/start-production-api.mjs` was run without `--start`. The workstation profile fails closed: `NODE_ENV` is not production, `SESSION_SECRET` and `INTERNAL_API_KEY` are placeholders, `WEBHOOK_BASE_URL` is not `https://webhook.valueor.org`, and `VITE_API_SERVER_URL` is loopback. `node scripts/check-production-worker.mjs` also fails closed because `NODE_ENV` is not production and `ALERT_WEBHOOK_URL` is unset. Do not edit the workstation `.env` to make those checks pass.

| Name | Required for |
|---|---|
| `VALUEOR_ENV` | `production` |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | sessions |
| `INTERNAL_API_KEY` | internal routes |
| `SUPABASE_URL` | hosted project |
| `SUPABASE_SERVICE_ROLE_KEY` | server role |
| `SUPABASE_DB_PASSWORD` or `DATABASE_URL` | server SQL |
| `WEBHOOK_BASE_URL` | `https://webhook.valueor.org` |
| `VITE_API_SERVER_URL` | public API origin, not loopback |
| `PRODUCTION_API_ORIGIN` | tunnel render |
| `VERCEL_GIT_COMMIT_SHA` | supplied by Vercel for the SPA |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe, if selected |
| `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET` | Paymob, if selected |
| `FAWRY_MERCHANT_CODE`, `FAWRY_SECURITY_KEY` | Fawry, if selected |
| `SAAS_CHECKOUT_PROVIDER` | active provider |
| `META_EMBEDDED_SIGNUP_APP_ID`, `META_EMBEDDED_SIGNUP_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID` | WhatsApp embedded signup |
| `WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | must stay unset until Meta credentials exist |
| `WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE` | must stay unset until a production subscribe is intended |
| `ALERT_WEBHOOK_URL` | worker alerts |
| `BILLING_LIFECYCLE_WORKER_CONFIRMED` | only after the API is ready |

Channel tokens for existing WhatsApp, Instagram, Messenger, and email rows live in `company_channels.configuration`, not in git. Do not print those rows.

## Separate deployment

Frontend, after the database migrations are applied and the API is ready:

1. Vercel builds `pnpm --dir artifacts/login-app build` from `vercel.json`. It does not run the API.
2. Open `https://app.valueor.org/version.json` and compare `sha` to the approved git commit.
3. Do this deploy separately from the database migration.

API:

1. Deploy the built `artifacts/api-server/dist` to the supervised host.
2. Pass readiness before rendering the tunnel.
3. Confirm `https://webhook.valueor.org/api/readyz` returns 200.

## Integrations

The server source still names the payment and WhatsApp environment keys. `node scripts/audit-integration-contracts.mjs` passed and did not call providers. Live callback verification waits until `webhook.valueor.org` reaches the production API. Payment method rows in the database include sandbox mode. Do not mark Stripe, Paymob, or Fawry ready until their secrets are set on the API host and a signed webhook test is recorded. Leave `WHATSAPP_EMBEDDED_SIGNUP_ENABLED` and `WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE` unset until that signup is intended.

## Migration order

On the disposable copy this order already applied: `361`, then `373` through `442`. `441` then `442` stay last. The hosted database is still at `372`, with `361` not applied. Files with data writes are listed in `docs/operations/pending-migration-risks.md`. `--include-all` is required for `361` because that version is older than `372`, and it must be used only with the local rehearsal URL.
