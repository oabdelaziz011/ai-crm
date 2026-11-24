# Meta OAuth safeguards (local)

Local-only implementation on `feat/meta-oauth-safeguards-local`. Do **not** apply migration `467` or enable flags in Production without separate approval.

## What changed

1. **blocked_existing_connection** — Messenger `complete` and Instagram Login persist refuse to overwrite existing credentials unless `confirmReplaceExisting` is true (UI confirm + signed OAuth state bit).
2. **Safe disconnect** — `credential_source` (`manual` | `oauth`). Manual disconnect soft-disables by default and keeps encrypted secrets unless the operator explicitly confirms clearing them. OAuth disconnect requires explicit confirmation before clearing.
3. **Durable pending sessions** — `meta_oauth_pending_sessions` (migration 467) + in-memory fallback; company-scoped; signed state CSRF unchanged.
4. **Token lifecycle** — Messenger already exchanges short-lived user tokens via `fb_exchange_token` and now stores `token_expires_at` when Meta returns `expires_in`. Instagram already exchanges/refreshes long-lived tokens.
5. **Health UX** — Settings strip no longer labels “health not run” as **Reauthorization Required**.

## Local Meta Development App test instructions

1. Apply migration **467** to **local** Supabase only:
   - `supabase db reset` (or apply `467_meta_oauth_safeguards.sql` against local).
2. In local `.env.localstack` (names only):
   - `META_MESSENGER_OAUTH_ENABLED=true`
   - `VITE_META_MESSENGER_OAUTH_ENABLED=true`
   - `META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS=<local-demo-company-uuid>`
   - App ID / App Secret / redirect URI for your **Development** Meta app
   - Same pattern for Instagram Login flags if testing IG
3. Meta App (Development):
   - Valid OAuth redirect: `http://127.0.0.1:3010/api/oauth/messenger/callback` (and IG counterpart)
   - Add your Facebook user as a tester/admin
4. Scenarios:
   - **New company**: Connect → select Page → expect Connected when subscribe + health succeed
   - **Existing manual**: Connect without confirm → API `MSL_BLOCKED_EXISTING_CONNECTION` / UI confirm required
   - **Manual disconnect**: Disable without clearing secrets → token fields still present
   - **Webhook fail**: Force subscribe error → status `webhook_subscription_failed`, not Connected
5. Never log access tokens; never point local flags at Production Meta webhooks.

## Production rollout checklist (do not execute yet)

Public-all allowlist syntax and rollback: see `docs/operations/meta-oauth-public-rollout.md`.

| #   | Step                                                                                              | Status                 |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | Meta App Review / Advanced Access for messaging scopes                                            | External               |
| 2   | Deploy API that includes `*` public-all allowlist parser (flags still **false**)                  | **Needs approval**     |
| 3   | Confirm migration **467** present on Production                                                   | Verify                 |
| 4   | Confirm redirect URIs + App ID/Secret present (no values in chat)                                 | Operator               |
| 5   | Set allowlists to `*` (not empty) **and** enable server flags                                     | **Needs approval**     |
| 6   | Deploy FE with `VITE_META_MESSENGER_OAUTH_ENABLED` / `VITE_META_INSTAGRAM_LOGIN_ENABLED` **true** | **Needs approval**     |
| 7   | Commercial entitlements still gate non-entitled companies                                         | Guard                  |
| 8   | Existing manual connections still require confirm-to-replace                                      | Guard                  |
| 9   | Verify outbound health for existing ValueOR manual Page stays green                               | Read-only              |
| 10  | Rollback = disable enablement flags (do not wipe credentials)                                     | See public-rollout doc |

## Automated tests

```bash
cd artifacts/api-server
node --import tsx/esm --test --test-force-exit \
  src/services/meta-oauth-safeguards.test.ts \
  src/services/meta-messenger-login-oauth.test.ts \
  src/services/meta-instagram-login-oauth.test.ts

cd ../login-app
node --import tsx/esm --test --test-force-exit \
  src/lib/channels/meta-connection-status.test.ts
```
