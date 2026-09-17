# Local per-developer Meta / Instagram / WhatsApp integration tunnel

This runbook is for **LOCAL** integration testing only.

It does **not** use, modify, or replace:

- production Cloudflare tunnel `vaultos-webhook`
- `https://webhook.valueor.org`
- production API / Supabase / Meta App production callbacks
- Vercel / Replit / production DNS

Each developer runs their **own** tunnel → their **own** `localhost:3001` → their **own** local Supabase.

---

## Architecture

```
External provider (Meta test app)
        ↓
https://<your-developer-tunnel>
        ↓  (cloudflared — YOUR config only)
http://localhost:3001
        ↓
Local ValueOR API (VALUEOR_ENV=local)
        ↓
Local Supabase http://127.0.0.1:54321
```

Developers must **not** share one tunnel.

---

## A. Normal local development (no Meta ingress)

```bash
pnpm dev:api:local    # API :3001 + local Supabase
pnpm dev:local        # Frontend :5173
```

Defaults:

| Setting | Value |
|---|---|
| Frontend | `http://localhost:5173` |
| API | `http://localhost:3001` |
| Supabase | `http://127.0.0.1:54321` |
| Postgres | `127.0.0.1:54322` |
| Public webhook base | **unset** (never falls back to `webhook.valueor.org`) |
| External outbound | **blocked** (`LOCAL_OUTBOUND_BLOCKED`) |

Do not set `ALLOW_LOCAL_EXTERNAL_OUTBOUND=1` for day-to-day UI work.

---

## B. Integration testing (inbound + optional outbound)

### 1. One-time Cloudflare setup (per developer)

1. Install `cloudflared` and run `cloudflared tunnel login` (your Cloudflare account).
2. Create a **new named tunnel** (example: `valueor-local-alice`).  
   **Do not** reuse or edit `vaultos-webhook`.
3. Create a **personal hostname** (example: `webhook-alice.yourdomain.test`).  
   **Do not** use `webhook.valueor.org`.
4. Copy template:

```bash
cp infra/cloudflare/local-developer.template.yml infra/cloudflare/config.alice.yml
```

Edit `config.alice.yml`:

- `tunnel:` → your tunnel id/name
- `credentials-file:` → your cloudflared credentials JSON
- `hostname:` → your personal hostname
- `service:` → **must** be `http://localhost:3001`

5. Copy env profile:

```bash
cp .env.local.integration.example .env.local.integration
```

Fill in:

```env
VALUEOR_ENV=local
LOCAL_INTEGRATION_ENABLED=true
ALLOW_LOCAL_EXTERNAL_OUTBOUND=0
PUBLIC_WEBHOOK_BASE_URL=https://webhook-alice.yourdomain.test
WEBHOOK_BASE_URL=https://webhook-alice.yourdomain.test
VITE_WEBHOOK_BASE_URL=https://webhook-alice.yourdomain.test
CLOUDFLARE_TUNNEL_CONFIG=infra/cloudflare/config.alice.yml
CLOUDFLARE_TUNNEL_HOSTNAME=webhook-alice.yourdomain.test
CLOUDFLARE_TUNNEL_NAME=valueor-local-alice
```

`.env.local.integration` and `infra/cloudflare/config.*.yml` are gitignored.

### 2. Start local stack + tunnel

```bash
# Terminal 1 — local API (must be :3001)
pnpm dev:api:local

# Terminal 2 — frontend (optional for UI)
pnpm dev:local

# Terminal 3 — YOUR tunnel only
pnpm dev:tunnel
# alias: pnpm dev:integration
```

`pnpm dev:tunnel` will:

1. Require `VALUEOR_ENV=local`
2. Require API on `:3001`
3. Refuse `vaultos-webhook` / `webhook.valueor.org` / `infra/cloudflare/config.yml`
4. Start cloudflared with **your** config only
5. Print Instagram / WhatsApp / Messenger callback URLs

### 3. Meta callback (manual — do not change production Meta)

In **your Meta development/test app** (prefer a separate app from production), set:

```text
https://<your-tunnel>/api/webhooks/instagram
https://<your-tunnel>/api/webhooks/whatsapp
https://<your-tunnel>/api/webhooks/messenger
```

Paste the URLs printed by `pnpm dev:tunnel`.

### 4. Optional real outbound

Only when you intentionally want Meta/Twilio sends from local:

```env
LOCAL_INTEGRATION_ENABLED=true
ALLOW_LOCAL_EXTERNAL_OUTBOUND=1
```

Then restart the local API so it reloads env.

Requirements still enforced:

- API remains on local Supabase
- Production webhook base is rejected
- Production tunnel is never started by `dev:tunnel`

Revert to `ALLOW_LOCAL_EXTERNAL_OUTBOUND=0` after testing.

### 5. Verify tunnel → your API

```bash
curl -s http://127.0.0.1:3001/api/healthz
curl -s https://<your-tunnel>/api/healthz
```

Both should hit the same local API. If the public URL returns production behavior or a foreign host, stop and fix your cloudflared config.

---

## C. Second developer setup (exact steps)

1. Create their own Cloudflare tunnel + hostname (not shared with you).
2. `cp infra/cloudflare/local-developer.template.yml infra/cloudflare/config.<name>.yml`
3. `cp .env.local.integration.example .env.local.integration`
4. Edit both files with **their** tunnel id, hostname, credentials path, and `PUBLIC_WEBHOOK_BASE_URL`.
5. Point **their** Meta test app callbacks at **their** public URLs.
6. Run `pnpm dev:api:local` then `pnpm dev:tunnel`.

No application source changes are required between developers.

---

## D. Stop the tunnel

Press `Ctrl+C` in the `pnpm dev:tunnel` terminal.

Or stop the `cloudflared` process that was started with your `config.<name>.yml`.

Do **not** stop or restart the production `vaultos-webhook` tunnel as part of local work.

---

## E. Safety checklist

| Check | Expected |
|---|---|
| `VALUEOR_ENV` | `local` |
| Tunnel config | `infra/cloudflare/config.<you>.yml` only |
| Ingress service | `http://localhost:3001` |
| Public base | your hostname — never `webhook.valueor.org` |
| Supabase | `127.0.0.1:54321` |
| Outbound default | blocked unless both integration flags set |
| Production tunnel | untouched |

---

## Meta limitations

- A single Meta App typically allows **one** callback URL per product (WhatsApp / Instagram / Messenger).
- Multiple developers therefore usually need **separate Meta development/test apps** (or carefully coordinated time-sharing of one test app — not recommended).
- Do **not** repoint the production Meta App at a developer tunnel.
- ValueOR does not auto-update Meta; callback URLs are configured manually in Meta Developer Console.

---

## Related commands (do not confuse)

| Command | Purpose |
|---|---|
| `pnpm dev:tunnel` / `pnpm dev:integration` | **LOCAL** per-developer tunnel → `:3001` |
| `pnpm tunnel:run` / `pnpm tunnel:setup` / `pnpm dev:webhook` | Existing shared/production-oriented webhook stack — **do not use for per-dev local isolation** |

---

## Env overlay notes

- `ensure-localstack-env.mjs` regenerates `.env.localstack` but **preserves** safe webhook bases from `.env.local.integration`.
- `loadProjectEnv` overlays integration keys in local mode.
- Vite sync writes `VITE_WEBHOOK_BASE_URL` only when a non-production local tunnel base is configured.
