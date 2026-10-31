# VPS deployment

This is the Hetzner deployment for `app.valueor.org`, `api.valueor.org`, and `webhook.valueor.org`. Supabase Cloud remains PostgreSQL, Auth, and Storage. Nothing in this file changes Production, DNS, or live secrets.

The current Vercel file `vercel.json` and the Cloudflare tunnel scripts under `infra/cloudflare/` and `scripts/cloudflare/` stay in place. Vercel is still the existing frontend host until DNS is changed. Developer tunnels stay for local work. Production `webhook.valueor.org` can point at only one origin, so the tunnel and this VPS are not both active for that hostname.

## What runs where

| Service | Process | Public port |
|---|---|---|
| Caddy | `caddy` | 80, 443/tcp, 443/udp |
| Frontend | nginx serving `artifacts/login-app/dist/public` | none |
| API | `node artifacts/api-server/dist/main.mjs` | none |
| Embedding worker | `artifacts/platform-worker/src/embedding-worker.ts` | none |

The API process also owns the timers that have no separate entry point:

- billing lifecycle, off unless `BILLING_LIFECYCLE_WORKER_ENABLED` and `BILLING_LIFECYCLE_WORKER_CONFIRMED` are both `true` (`artifacts/api-server/src/services/subscription-lifecycle-worker.ts`)
- session idle (`artifacts/api-server/src/services/session-idle-timeout-worker.ts`)
- email inbound poll (`artifacts/api-server/src/services/email-inbound-poll-worker.ts`)
- sales follow-up, off unless `SALES_FOLLOW_UP_WORKER_ENABLED=true` (`artifacts/api-server/src/services/sales-follow-up-worker.ts`)
- WhatsApp reply recovery, off unless `WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED=true` (`artifacts/api-server/src/services/whatsapp-reply-recovery-worker.ts`)

Keep the `api` service at one replica. A second replica would run those timers twice. The embedding worker is already a separate process and has its own Compose service.

`artifacts/api-server/src/index.ts` stops those timers on `SIGTERM` and then closes the HTTP server. The embedding worker stops its poll on `SIGTERM` and exits. Compose gives both 30 seconds.

## Routing

Startup checks accept only the hosted Supabase project already recorded for local-mode rejection. Any other `supabase.co` host, including a development project, is refused.

Caddy sends `app.valueor.org` to the frontend container and both `api.valueor.org` and `webhook.valueor.org` to the API container. The API body limit is 8 MB for JSON and 2 MB for signed webhook bodies (`artifacts/api-server/src/app.ts`). Caddy allows 12 MB. `trust proxy` is `1`, which matches this single Caddy hop. Proxied Cloudflare traffic makes the edge the immediate client, so request logs show the edge address until Caddy `trusted_proxies` is set to the Cloudflare ranges. The session cookie is `httpOnly` and `secure` when `NODE_ENV=production`. The browser origin `https://app.valueor.org` is already on the API CORS allowlist (`artifacts/api-server/src/middleware/cors.ts`).

There is no WebSocket server in the API. Browser realtime goes to Supabase. Caddy still forwards `Upgrade` if a future route needs it.

Webhook paths on `https://webhook.valueor.org`:

- `/api/webhooks/whatsapp`
- `/api/webhooks/instagram`
- `/api/webhooks/messenger`
- `/api/webhooks/email`
- `/api/webhooks/sms`
- `/api/webhooks/payments/:provider`

The browser calls `https://api.valueor.org`. Channel callback URLs use `VITE_WEBHOOK_BASE_URL`, not the API origin (`artifacts/login-app/src/lib/channels/whatsapp-channel-utils.ts`).

Liveness is `GET /api/healthz`. Readiness is `GET /api/readyz` and checks Supabase. The frontend liveness path is `GET /healthz`.

## Server preparation

Recommended size for the first 20 companies: Hetzner **CX33** (4 shared vCPU, 8 GB RAM, 80 GB NVMe) in Helsinki when the console shows it in stock. If CX33 is unavailable, use **CPX32** (4 shared AMD vCPU, 8 GB RAM, 160 GB NVMe). Prices checked from public October 2026 listings were about €8.49–€8.99 for CX33 and about €35.49 for CPX32, excluding VAT, and stock changes. Confirm both in the Hetzner order screen before purchase.

Assumptions: Supabase Cloud holds the database and files, AI calls leave the VPS, and 20 companies do not all embed large documents at once. Four gigabytes is too small for the API and the embedding worker together. Stay on x86. Add a public IPv4.

Compose caps are Caddy 256 MB, frontend 128 MB, API 2560 MB, and embedding worker 2048 MB (about 4.9 GB together). On an 8 GB VPS that leaves roughly 3 GB for the OS, Docker, and page cache. If the API and worker both sit at their caps, the host can start reclaiming memory. Do not add a second API replica. Keep `WORKER_BATCH_SIZE` at 8 unless a later measurement shows headroom. Image builds are not covered by those caps and can use several gigabytes; build while the stack is stopped, or add swap before the first build on the VPS.

On the new server, before the GitHub workflow:

1. Create a non-root sudo user with an SSH key. Disable password login and root SSH login in `sshd_config`.
2. Install Docker Engine and the Docker Compose plugin, plus `git`.
3. Apply a Hetzner Cloud firewall and `ufw` that allow 22/tcp from your IP, and 80/tcp, 443/tcp, and 443/udp from anywhere. Do not open 3000 or 5432.
4. Create `/opt/valueor` only by letting the workflow clone the repository, or clone it yourself and leave the worktree clean.
5. Copy `deploy/vps/production.env.example` to `deploy/vps/production.env` and fill the empty secret names on the server. Keep a copy of that file in a password manager. Do not commit it.
6. Point GitHub secrets at the server: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, and optional `VPS_SSH_PORT`. Add required reviewers on the GitHub `production` environment.

For DNS-only records, leave `CADDYFILE` unset. Caddy requests a certificate when ports 80 and 443 reach the VPS. Set `ACME_EMAIL`.

For proxied Cloudflare records, set `CADDYFILE=./Caddyfile.cloudflare`, put the Cloudflare origin certificate at `deploy/vps/certs/origin.pem` and `origin.key`, and set Cloudflare SSL/TLS to Full (strict). The certificate must include `app.valueor.org`, `api.valueor.org`, and `webhook.valueor.org`, because every site block uses that one pair. Those certificate files are gitignored. A failed startup check exits 1, and `restart: unless-stopped` will keep restarting that container until the env file is fixed.

## Deploy and rollback

The workflow `.github/workflows/vps-deploy.yml` runs only from a manual dispatch on `main`, and only when the confirmation text matches the action. A deploy waits for the existing Production Gate. A rollback skips the gate and retags `valueor-app:previous` and `valueor-frontend:previous` back to `:current`.

Check these after the first boot, still without changing provider dashboards until the hostnames answer:

- `https://app.valueor.org/version.json` matches the deployed SHA.
- `https://api.valueor.org/api/readyz` returns 200 with `nodeEnv` of `production`.
- `https://webhook.valueor.org/api/healthz` returns 200.

Logs stay separate per service in Docker json logs, rotated at 10 MB with five files. Rollback does not restore the database. Supabase backups remain the database recovery path. Do not copy the Production database onto the VPS.

Configuration backup is the server env file, the origin certificate if you use one, and the Caddy data volume. Losing the VPS does not lose customer data stored in Supabase.
