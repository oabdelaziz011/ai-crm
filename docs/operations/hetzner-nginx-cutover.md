# Hetzner Nginx cutover

Production API is already reachable at `https://api.valueor.org` on the Hetzner VPS `2.31.182.5`. This file is the remaining cutover plan for systemd, webhooks, frontend DNS, and Meta Test App verification. It does not change DNS, Meta, or production secrets by itself.

## Target architecture

```
Internet
  → Cloudflare (proxied HTTPS)
  → Hetzner VPS 2.31.182.5
      → Nginx (Cloudflare Origin Certificate)
          → Frontend static files: /var/www/valueor
          → API + webhooks: 127.0.0.1:3001
      → Hosted Supabase (lfbtnskmvibikalsxwsm.supabase.co)
```

One Node process serves both `api.valueor.org` and `webhook.valueor.org`. Browser calls use the API hostname. Meta and payment callbacks use the webhook hostname.

## Already complete

- VPS Ubuntu, Docker, swap, firewall, Nginx, Origin Certificate.
- Repository at `/opt/valueor` on `main`.
- API health and readiness through Cloudflare:
  - `GET https://api.valueor.org/api/healthz` → `{"status":"ok"}`
  - `GET https://api.valueor.org/api/readyz` → ready, supabase ok
- DNS A record for `api` → `2.31.182.5`, Proxied.
- Frontend artifact path `/var/www/valueor` prepared from CI.
- Hosted Supabase remains the database. Sessions use the Postgres-backed store; do not recreate a second pool.

## Not complete

- No confirmed systemd unit for the API. The process still depends on a manual background start.
- `webhook.valueor.org` still points at the old Cloudflare Tunnel and returns Cloudflare 1033/530.
- `www.valueor.org` has no public DNS record yet (NXDOMAIN). `https://app.valueor.org` still answers on Vercel.
- Meta Test App still points at the developer environment, not the VPS.
- Live API build commit reported by `/api/readyz` is `0273b2fe`. Deploy the current tree before relying on newer CORS headers such as `X-ValueOR-Instance`.

## Session table required by this repository

Production cookie sessions use the custom `PostgresSessionStore` in
`artifacts/api-server/src/session/postgres-session-store.ts`, not `connect-pg-simple`.

Required object (from `supabase/migrations/443_api_runtime_express_sessions.sql`):

- Schema: `api_runtime` (not exposed by PostgREST)
- Table: `api_runtime.express_sessions`
- Columns: `sid text primary key`, `sess jsonb not null`, `expire timestamptz not null`
- Index: `express_sessions_expire_idx` on `expire`
- Privileges: revoke from `public`, `anon`, `authenticated`, `service_role`; API uses `DATABASE_URL` as DB owner

`public.user_sessions` is not referenced by this codebase. If that table exists in hosted
Supabase from an earlier experiment, leave it alone and apply migration 443 only after
explicit approval. Do not point the running API at `public.user_sessions` without a code change.

## systemd

Tracked unit: `deploy/vps/systemd/valueor-api.service`.
Idempotent installer: `deploy/vps/install-nginx-systemd-cutover.sh`.

```bash
# Copy files and validate Nginx only. Does not stop the live process.
sudo bash /opt/valueor/deploy/vps/install-nginx-systemd-cutover.sh --install-only

# After review, stop the current :3001 holder and start systemd.
sudo bash /opt/valueor/deploy/vps/install-nginx-systemd-cutover.sh --confirm-stop-port-holder

sudo systemctl status valueor-api.service
journalctl -u valueor-api.service -e --no-pager
```

The unit:

- Loads `/opt/valueor/.env` through `EnvironmentFile`.
- Starts `node /opt/valueor/deploy/vps/start-api.mjs` (no source maps, production checks).
- Listens on `PORT=3001`.
- Restarts on failure, stops with `SIGTERM`, caps memory at 1200M.
- Leaves billing lifecycle, sales send, WhatsApp recovery, and the embedding worker off.

Do not put secret values in the unit file. Confirm `EMAIL_POLL_WORKER_ENABLED` and `SESSION_IDLE_TIMEOUT_WORKER_ENABLED` only after cutover approval; keep them false while both the old and new processes would otherwise poll the same mailbox.

## Nginx templates

Tracked templates:

- `deploy/vps/nginx/valueor-frontend.conf`
- `deploy/vps/nginx/valueor-api.conf`

They expect Origin Certificate files already on the server:

- `/etc/nginx/ssl/origin-cert.pem`
- `/etc/nginx/ssl/origin-key.pem`

Validate before reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl --resolve api.valueor.org:443:127.0.0.1 https://api.valueor.org/api/healthz
curl --resolve webhook.valueor.org:443:127.0.0.1 https://webhook.valueor.org/api/healthz
```

Do not overwrite the certificate files from git.

## Production environment names

Required on the VPS (values stay on the server):

- `VALUEOR_ENV=production`
- `NODE_ENV=production`
- `PORT=3001`
- `SESSION_SECRET`
- `INTERNAL_API_KEY`
- `SUPABASE_URL` / `VITE_SUPABASE_URL` → recorded production project
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` preferred, or `SUPABASE_DB_PASSWORD` + `SUPABASE_PROJECT_REF` + `SUPABASE_REGION`
- `VITE_API_SERVER_URL=https://api.valueor.org`
- `WEBHOOK_BASE_URL=https://webhook.valueor.org`
- `VITE_WEBHOOK_BASE_URL=https://webhook.valueor.org`
- `PUBLIC_WEBHOOK_BASE_URL=https://webhook.valueor.org`
- `VITE_APP_ORIGIN`, `FRONTEND_ORIGIN`, `VITE_SITE_URL` → `https://app.valueor.org` or `https://www.valueor.org`

`billingLifecycle` stays false until both `BILLING_LIFECYCLE_WORKER_ENABLED=true` and `BILLING_LIFECYCLE_WORKER_CONFIRMED=true` are set after a deliberate validation. That is intentional, not a readiness failure.

## WhatsApp / Meta Test App

Callback URL for the existing Meta Test App:

`https://webhook.valueor.org/api/webhooks/whatsapp`

Optional per-channel URL:

`https://webhook.valueor.org/api/webhooks/whatsapp/{companyChannelId}`

Verification:

1. Meta Developer → your Test App → WhatsApp → Configuration → Webhook.
2. Set Callback URL to `https://webhook.valueor.org/api/webhooks/whatsapp`.
3. Set Verify Token to the exact token already stored for that company channel in ValueOR. Do not invent a new token and do not paste it into chat.
4. Subscribe to the WhatsApp fields your channel already uses (messages and message status at minimum).
5. Click Verify and Save. The API resolves the token with `findCompanyChannelsByWhatsAppVerifyToken` and accepts only exactly one match.
6. Send a test inbound message from the Meta test number.
7. Confirm the conversation appears for the correct company.
8. Reply from the product and confirm outbound delivery plus status callbacks.

POST handling verifies `X-Hub-Signature-256` with the channel app secret, keeps the raw body for signature checks, and returns 401 on invalid signatures. Do not point Meta at the VPS until `webhook.valueor.org` DNS points at `2.31.182.5` and local Nginx health checks pass.

## DNS changes still required (manual)

Do not change email MX, SPF, or DKIM.

| Name | Current | Proposed | Notes |
|---|---|---|---|
| `api` | A → `2.31.182.5`, Proxied | keep | Already working |
| `webhook` | Tunnel / Cloudflare 1033 | A → `2.31.182.5`, Proxied | Retire tunnel route after health checks |
| `www` | missing (NXDOMAIN) | A → `2.31.182.5`, Proxied, or CNAME to the apex policy you choose | Required before the VPS frontend is public |
| `app` | CNAME → Vercel | leave until www cutover is verified | Do not delete yet |

SSL: keep Cloudflare Full until Origin Certificate host coverage for `api`, `webhook`, and the chosen frontend hostname is confirmed, then move to Full (strict).

## Rollback

1. Keep the previous API process instructions and the previous Nginx site files.
2. If systemd fails: `sudo systemctl stop valueor-api` and restart the known-good manual process on 3001 only after confirming nothing else owns the port.
3. If webhook DNS cutover fails: restore the previous Cloudflare Tunnel CNAME for `webhook` and stop Meta traffic to the VPS.
4. If frontend DNS fails: leave `app.valueor.org` on Vercel and remove or disable the new `www` record.
5. Database rollback is unrelated to the VPS image. Use Supabase backups. Do not copy Production data onto the VPS.

## Final ordered launch checklist

1. Deploy current API build to `/opt/valueor` without stopping the healthy process until ready.
2. Confirm `/opt/valueor/.env` has the required names and production public URLs.
3. Install Nginx templates, run `nginx -t`, reload.
4. Install and start `valueor-api.service` on port 3001; probe health and readiness.
5. Stop only the superseded manual process after systemd is healthy.
6. Add/move Cloudflare `webhook` A record to `2.31.182.5` (Proxied).
7. Probe `https://webhook.valueor.org/api/healthz`.
8. Point Meta Test App webhook to `https://webhook.valueor.org/api/webhooks/whatsapp` and verify.
9. Send inbound/outbound WhatsApp tests.
10. Add `www` DNS when the frontend artifact and CORS origins are confirmed.
11. Rebuild the frontend in CI with `VITE_API_SERVER_URL=https://api.valueor.org` and `VITE_WEBHOOK_BASE_URL=https://webhook.valueor.org`, then publish to `/var/www/valueor`.
12. Only after Meta production readiness, graduate the WhatsApp app from Test to Live.
