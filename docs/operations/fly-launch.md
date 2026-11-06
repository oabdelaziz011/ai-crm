# Fly.io API launch

One always-on 1 GB Machine for the Node API. The frontend stays on Vercel. Supabase Cloud stays the database. The embedding worker stays off. `deploy/vps/` remains the later Hetzner path and is not deployed in this step.

Do not create the Fly account, deploy, or change DNS until that work is approved. This file does not do those things.

## What Fly runs

`fly.toml` builds `deploy/vps/Dockerfile` target `app`. The command is `node deploy/vps/start-api.mjs`. That script reads the process environment, refuses a loopback or non-production Supabase host, then starts `artifacts/api-server/dist/main.mjs`.

The process listens on port 3000. Fly’s HTTP service uses that internal port, forces HTTPS on the public edge, and checks `GET /api/healthz`. Autostop is `off` and autostart is `false`, so the Machine stays up when idle and Fly does not add Machines. `kill_signal` is `SIGTERM` and `kill_timeout` is 30 seconds. The API handles that signal by stopping its timers and closing the server.

`NODE_OPTIONS=--max-old-space-size=512` caps the V8 heap. The measured production heap was about 154 MB total, so the cap leaves room for a customer-import file and still stops a heap leak before it reaches the Machine limit. Native memory sits outside the cap. The HTTP concurrency hard limit is 150 requests.

The Dockerfile still compiles the frontend while building the API image. That work runs on the Fly builder, not inside the 1 GB Machine. The runtime image also contains the repo tree from that build. Disk size is not the same as resident memory.

## Memory

The production entry no longer passes `--enable-source-maps`. The map file is about 59 MB and, when loaded, expands inside the V8 heap. A local production-mode process with the map enabled used about 650 MiB RSS and 574 MiB of heap. The same process without the map, after the Postgres session store, used about 185 MiB RSS and 120 MiB of heap. Peak sampled RSS during 40 health checks, 8 logins, one oversized body, and one 6 MB customer-import body stayed at 185 MiB. The earlier 1 GB container sample of 578 MiB was the source-map process.

Cookie sessions are stored in `api_runtime.express_sessions`, not in the process. Ordinary JSON is limited to 1 MB. Customer-import bodies stay at 8 MB on that path only. Webhook raw bodies stay at 2 MB. Email and WhatsApp files upload to storage from the browser.

`/api/readyz` is still the wrong Fly check. Keep `GET /api/healthz`.

Apply `supabase/migrations/443_api_runtime_express_sessions.sql` before relying on the cookie login. The dashboard bearer token does not use this table. Do not apply that migration until it is approved. While `api_runtime` contains only the session table, the rollback is `drop schema if exists api_runtime cascade`. The local measurement created the table on the loopback database and removed it afterward.

1 GB is the minimum Machine size for this process. 512 MB of heap cap keeps a leak under the Machine limit. A 2 GB Machine is the size to use only if source maps are turned back on.

## Temporary hostname

After a later `fly deploy`, Fly serves `https://valueor-api.fly.dev` before any custom domain exists. Check:

- `GET https://valueor-api.fly.dev/api/healthz` returns 200.
- `GET https://valueor-api.fly.dev/api/readyz` returns 200 only when the Supabase secrets on the Machine can read the hosted database.

Leave Meta, payment, and email callback settings on `https://webhook.valueor.org`. The `fly.dev` name is an operator probe. The browser app is not configured to call it. CORS does not need that hostname.

## Secrets

`fly.toml` holds public origins and worker switches only. Set credentials in the Fly app, not in git:

```
fly secrets set --stage \
  SESSION_SECRET=... \
  INTERNAL_API_KEY=... \
  SUPABASE_URL=... \
  VITE_SUPABASE_URL=... \
  VITE_SUPABASE_PUBLISHABLE_KEY=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_DB_PASSWORD=... \
  SUPABASE_PROJECT_REF=... \
  SUPABASE_REGION=eu-north-1
```

`--stage` stores them for the next deploy. Do not paste the values into a shell history you keep, and do not commit them.

`start-api.mjs` needs `SESSION_SECRET`, `INTERNAL_API_KEY`, the hosted Supabase URL, and either `DATABASE_URL` or `SUPABASE_DB_PASSWORD` plus the project ref. The API derives the pooler URL from the password and ref when `DATABASE_URL` is empty. Prefer the pooler URL in `DATABASE_URL` when you have it, and still keep it in Fly secrets.

Add provider keys only when that provider is in use: `OPENAI_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Paymob, Fawry, and the Meta embedded-signup names from `deploy/vps/production.env.example`. Leave embedded signup and billing confirmation unset. `ACME_EMAIL` and `ALERT_WEBHOOK_URL` belong to the VPS Caddy and embedding worker, not this Machine.

## Frontend build

Vite reads `VITE_API_SERVER_URL` and `VITE_WEBHOOK_BASE_URL` at build time. Setting them on Fly does not change the Vercel site. The Vercel project needs both values, then a new production build:

- `VITE_API_SERVER_URL=https://api.valueor.org`
- `VITE_WEBHOOK_BASE_URL=https://webhook.valueor.org`
- `VITE_APP_ORIGIN=https://app.valueor.org`
- `VITE_SITE_URL=https://app.valueor.org`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the hosted project

`artifacts/login-app/src/lib/api-server/normalize-api-base.ts` sends browser calls to `VITE_API_SERVER_URL`. `artifacts/login-app/src/lib/channels/whatsapp-channel-utils.ts` prefers `VITE_WEBHOOK_BASE_URL` for channel callbacks. The current live bundle contains the webhook hostname and does not contain `api.valueor.org`, so the existing Vercel deployment cannot call the API until it is rebuilt.

## Deploy and roll back

These commands are for after the Fly account exists. They are not to be run as part of preparing this file.

1. `fly auth login`
2. `fly apps create valueor-api` if the app does not exist. If that name is taken, change `app` in `fly.toml` before deploying.
3. `fly secrets set --stage` with the names above.
4. `fly deploy --ha=false` from the repo root. `--ha=false` keeps a single Machine.
5. Probe `https://valueor-api.fly.dev/api/healthz`.
6. Do not attach `api.valueor.org` or `webhook.valueor.org` yet.

Rollback replaces the Machine image only. It does not change DNS, Vercel, Supabase, or provider dashboards.

1. `fly releases`
2. `fly releases rollback <previous-version>`
3. Probe `/api/healthz` on the `fly.dev` hostname again.

## Moving webhook.valueor.org

Do this only after the `fly.dev` health check is green, and only with an explicit DNS approval. The tunnel is already returning Cloudflare error 1033, so there is no healthy origin to preserve.

1. Keep Meta and payment callbacks pointed at `https://webhook.valueor.org`. Do not edit those dashboards if the path stays `/api/webhooks/...`.
2. Add the Fly certificates for `api.valueor.org` and `webhook.valueor.org` only when you are ready to publish the DNS names Fly asks for.
3. Change Cloudflare DNS for those two names from the tunnel to the Fly app. Do not change `app.valueor.org`; it stays on Vercel.
4. Request `https://webhook.valueor.org/api/healthz` and `https://api.valueor.org/api/healthz`. Both should return 200 from the Machine.
5. Stop the production tunnel route for `webhook.valueor.org` after those checks pass, so the hostname has one origin. Keep the developer tunnel scripts.
6. Rebuild Vercel with the two `VITE_` origins if that build is not already live.
7. Send one provider verification request only after the public health checks pass.

## Plans this repo cannot see

The Supabase organization plan is not in the repo. Free projects pause after about a week of low database activity and include 500 MB of database size. Paid projects are not paused for inactivity. Pro starts at $25 per month. Confirm the live project is on a paid plan before customers depend on it.

The Vercel plan is not in the repo. The live site returns HTTP 200 from Vercel. Hobby is restricted to non-commercial personal use. A site that takes payments needs Pro or Enterprise. Confirm the project plan before charging customers.

Fly’s published 1 GB shared Machine price of about $6.70 per 30 days is the multiplier-1 region price. `primary_region` is `arn` so the API stays near the `eu-north-1` Supabase pooler. Confirm the `arn` rate on Fly’s pricing page before creating the Machine; a European region can cost more than Ashburn.
