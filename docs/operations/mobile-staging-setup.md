# Mobile staging setup

The cheapest safe staging path is a separate Supabase Free project, the existing API on this PC, and a temporary Cloudflare quick tunnel. It does not use Fly.io, Render, or a paid EAS build. The web application stays on Local and Production.

`pnpm dev:api:staging` starts the same `artifacts/api-server` code with `VALUEOR_ENV=staging`. The process listens on `127.0.0.1:3011` only. `deploy/vps/start-api.mjs` and `fly.toml` remain the Production entry and are not used here.

## Cost

| Piece | Cost at this stage |
|---|---|
| Supabase Free project | $0 if the organization still has a free-project slot. This repo cannot see that allowance. A free project pauses after about a week of low activity and includes 500 MB of database. Pro starts at $25 per month and is not required for this test. |
| API on this PC | $0. No extra host. |
| Cloudflare quick tunnel | $0. No DNS change and no named Production tunnel. The `https://*.trycloudflare.com` URL changes every start and dies when the process stops. |
| Fly.io | Not used. The documented 1 GB Machine is about $6.70 per 30 days and is deferred. |
| Render Free | Not used. The repo's launch notes say the free service sleeps after 15 minutes, which drops the API timers. Use it only if `cloudflared` cannot be installed. Expect cold starts, no durable disk, and a public URL that is down while asleep. |

Do not upgrade Supabase or create a Fly app to finish this step. If the free-project limit is already reached, stop and ask before paying.

## Supabase project settings

Create a new project only after approval. It must be a different project from Production.

- Choose any Supabase region. Set `SUPABASE_REGION` in `.env.staging` to that region so the pooler URL matches. The PC connects outbound. No Fly region is involved.
- Database password stored only as a server secret.
- Authentication: email and password. Site URL is the staging API origin the owner chooses, not `https://app.valueor.org`. Add the mobile scheme `valueor://` to the redirect allow list.
- Do not import Production users or rows.
- Enable the extensions the migrations request: `pgcrypto` and `vector` in the `extensions` schema. The migration files create them with `create extension if not exists`. Do not enable extra extensions by hand.
- Storage buckets are created by the migrations. `conversation-attachments` must remain private. Do not make a private bucket public to help a test.
- Apply migrations only after the project ref is checked against the Production project, the database is empty, and the owner approves. Run them in filename order. `node scripts/staging/check-migrations.mjs` checks duplicate version prefixes. Do not insert migration history manually.
- Backups: use the Supabase project backup for this project only. Do not restore a Production backup into it.

## API configuration

The staging process needs `.env.staging`, copied from `.env.staging.example`.

Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `SESSION_SECRET`, `INTERNAL_API_KEY`.

Mobile bundle, and only these: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The Supabase values must be the staging project. `EXPO_PUBLIC_API_URL` is the temporary tunnel URL, not `127.0.0.1`.

Leave email, WhatsApp, Instagram, Facebook, billing, and sales-send workers off. Staging must not deliver real customer messages.

Health check: `GET /api/healthz`. Readiness stays `GET /api/readyz` and is not the load-balancer check.

CORS must allow the staging web origin only if a staging web host is later approved. The mobile app does not rely on browser CORS. Do not add `https://app.valueor.org` as a reason to call the staging API from the Production web app.

## Synthetic seed

`node scripts/staging/seed-staging.mjs` exits without contacting a database until `.env.staging` exists and the owner approves the insert.

The future seed is synthetic:

- Companies: Alpha, Beta, and Gamma, on their own subdomains.
- Users: Super Admin, Company Admin, Employee, and Restricted Employee.
- Records: customers, leads, opportunities, conversations, tickets, email rows, branches, departments, and notifications.
- No Production export.
- No live provider calls and no seeded “sent” delivery status.

## Local API and temporary tunnel

1. Confirm the Supabase dashboard still allows a free project. Create that project only after this check. Do not copy Production data into it.
2. Copy `.env.staging.example` to `.env.staging` and fill the staging project values. Leave `EXPO_PUBLIC_API_URL` empty until the tunnel prints a URL.
3. `pnpm dev:api:staging` in one terminal. It refuses to start when `.env.staging` is missing or points at Production. Health check: `http://127.0.0.1:3011/api/healthz`.
4. `cloudflared` 2026.7.2 is already installed on this PC. Run `node scripts/staging/run-tunnel.mjs` in a second terminal. Do not leave it running after the test. It forwards only to `127.0.0.1:3011`, strips any tunnel token from the child process, and rejects a Production hostname.
5. Copy the printed `https://*.trycloudflare.com` URL into `EXPO_PUBLIC_API_URL`. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the staging project.
6. Start Metro from `artifacts/mobile-app` with those three variables. Use a development client or Expo Go on the phone. The JS bundle can use the LAN. API calls use the tunnel, so the phone must not be given `127.0.0.1` or `10.0.2.2` for the staging API.
7. The preview EAS profile still expects that same HTTPS pair. Do not start a paid preview build for this step.

The existing `pnpm dev:tunnel` command is for the named local integration tunnel. Do not point it at this staging API, and do not reuse the Production tunnel token or `webhook.valueor.org`.

## Shutdown

1. Stop the tunnel process. The temporary hostname stops resolving.
2. Stop `pnpm dev:api:staging`. Port 3011 closes.
3. Leave the Supabase Free project paused, or delete that project from the Supabase dashboard when the test is finished. Do not delete the Production project.
4. Remove the tunnel URL from the shell before the next Metro session so a later local build does not keep calling it.

## Security restrictions

- Staging binds to `127.0.0.1` only. The phone reaches it through the tunnel, not through the LAN.
- The quick-tunnel URL is public for as long as the process runs. Stop it after the test. Staging still requires authentication.
- Service-role keys stay in `.env.staging`. They are not Expo public variables.
- Outbound email, WhatsApp, Instagram, Facebook, billing, and sales-send workers stay off.
- Do not restore a Production backup. Do not apply this migration sequence to Production.

## Security checklist

- Staging Supabase project is not the Production project.
- Service-role key is absent from Expo public config.
- Preview build rejects Production hosts.
- Production build rejects staging hosts.
- `.env.staging` is gitignored.
- Workers that send messages are off.
- Migrations have not been applied to Production by this work.
