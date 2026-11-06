# Low-cost production launch

Interim hosting for the first 5–10 companies, with room to grow toward 20. Supabase Cloud stays the database, Auth, and Storage. The frontend stays on the current Vercel project. Do not buy the Hetzner VPS yet. `docs/operations/vps-deployment.md` and `deploy/vps/` stay in the repo for that later move.

Nothing in this file changes Production, DNS, secrets, or provider dashboards.

## What has to stay running

The API is one long-lived Node process (`artifacts/api-server/src/index.ts`). It serves browser calls and inbound webhooks, and it owns the timers that have no separate program:

- Session idle timeout. On unless `SESSION_IDLE_TIMEOUT_WORKER_ENABLED` is `false`, `0`, `no`, or `off`.
- Email inbound poll. On unless `EMAIL_POLL_WORKER_ENABLED` is `false`, `0`, or `off`. Provider send from that poll stays off unless `EMAIL_POLL_WORKER_EXECUTE_AI=true`.

Keep a single replica. A second replica runs those timers twice.

Leave these off until you deliberately need them:

- Billing lifecycle, until both `BILLING_LIFECYCLE_WORKER_ENABLED` and `BILLING_LIFECYCLE_WORKER_CONFIRMED` are `true`.
- Sales follow-up, unless `SALES_FOLLOW_UP_WORKER_ENABLED=true`. Sending stays off unless `SALES_FOLLOW_UP_WORKER_ALLOW_SEND=true`.
- WhatsApp reply recovery, unless `WHATSAPP_REPLY_RECOVERY_WORKER_ENABLED=true`.
- The embedding worker (`artifacts/platform-worker`). It is a second process and is not required to receive messages.

`deploy/vps/start-api.mjs` is the production entry. It reads the process environment only, refuses loopback and a non-production Supabase host, then starts `artifacts/api-server/dist/main.mjs`. Health is `GET /api/healthz`. Readiness is `GET /api/readyz`. `SIGTERM` stops the timers and closes the server.

## Public hostnames

| Hostname | Role for this launch |
|---|---|
| `app.valueor.org` | Existing Vercel frontend. Do not move it. |
| `api.valueor.org` | The always-on API. This name has no DNS record yet. |
| `webhook.valueor.org` | Same API process. Meta, email, and payment callbacks use this origin. |

Browser calls use `VITE_API_SERVER_URL`. Channel callbacks use `VITE_WEBHOOK_BASE_URL`, then fall back to the API URL (`artifacts/login-app/src/lib/channels/whatsapp-channel-utils.ts`). Both must be set when the frontend is built. Production checks require `WEBHOOK_BASE_URL=https://webhook.valueor.org` and a non-loopback API origin.

Point `api.valueor.org` and `webhook.valueor.org` at that one process. Retire the production Cloudflare Tunnel for `webhook.valueor.org` in the same DNS change. The hostname cannot be both the tunnel and the new origin. Do not delete `infra/cloudflare/` or `scripts/cloudflare/`; developer tunnels stay for local work.

## Recommended host

The Machine configuration is `fly.toml`. The procedure is `docs/operations/fly-launch.md`. One always-on Fly.io Machine, `shared-cpu-1x` with 1 GB RAM, in `arn` so it stays near the Supabase pooler. Public Fly.io prices checked on 31 October 2026 were about $6.70 per 30 days for that size in a multiplier-1 region, plus about $0.02 per GB of outbound traffic in North America and Europe. Confirm the `arn` rate before creating the Machine. The first 10 single-hostname certificates are free. A dedicated IPv4 is not required.

Use the existing `deploy/vps/Dockerfile` app target, or the same `start-api.mjs` command, with one Machine and no autoscaling. Do not add a second Machine. Do not enable the embedding worker on this size.

512 MB is not a launch size. The measured process is about 185 MB without source maps and about 650 MB with them. Render’s always-on 512 MB plan was $7 per month on the same date and sleeps on the free plan after 15 minutes, which drops the timers and misses webhook retries. Railway’s free credit cannot keep a process up for a month. New Fly.io accounts have a short trial, not a standing free allowance.

Cloudflare Workers and Vercel functions are not substitutes. This server is an Express process with `setInterval` timers and IMAP polling. Moving it would be a rewrite, not a configuration change.

## Later move to Hetzner

When one 1 GB process is no longer enough, use the already committed Compose stack in `deploy/vps/`. That path puts the frontend, API, and embedding worker on one VPS and keeps Supabase Cloud. Do not run both the Fly Machine and the VPS for `webhook.valueor.org`.
