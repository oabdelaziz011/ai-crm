# Meta OAuth public rollout (Messenger + Instagram Login)

Operational guide for enabling self-service Meta OAuth for **all commercially entitled** ValueOR companies.

This document does **not** authorize Production changes by itself. Execute only with explicit approval.

## Allowlist syntax (server)

| Value                                          | Meaning                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| _(empty / missing / whitespace)_               | **Deny all** companies (default).                                                             |
| `*`                                            | **Public-all** for the OAuth company gate: any valid company UUID passes the allowlist check. |
| Comma/space-separated UUIDs                    | **Explicit allowlist**: only those company IDs.                                               |
| Unrecognized tokens alone (e.g. `all`, `true`) | **Deny all** (no fail-open).                                                                  |

Dedicated env vars:

- `META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS`
- `META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS`

If a dedicated list is empty, the code falls back to `META_PAGES_OAUTH_ALLOWED_COMPANY_IDS` with the **same** deny-by-default / `*` / UUID rules.

`*` does **not** bypass:

- `META_MESSENGER_OAUTH_ENABLED` / `META_INSTAGRAM_LOGIN_ENABLED`
- Supabase auth + company scope
- Commercial entitlements (`facebook_channel`, `instagram_channel`)
- Credential overwrite / disconnect safeguards
- Signed OAuth state + durable pending sessions

## Public-all Production configuration (names only)

```bash
# Server (Contabo /opt/valueor/.env) — after Meta App Review + Advanced Access
META_OAUTH_PUBLIC_API_BASE_URL=https://api.valueor.org
META_MESSENGER_OAUTH_ENABLED=true
META_INSTAGRAM_LOGIN_ENABLED=true
META_MESSENGER_OAUTH_ALLOWED_COMPANY_IDS=*
META_INSTAGRAM_LOGIN_ALLOWED_COMPANY_IDS=*
# App ID / App Secret / state secrets must be present (never log values)

# Frontend bake (vps-deploy) — requires Contabo FE rebuild
VITE_META_MESSENGER_OAUTH_ENABLED=true
VITE_META_INSTAGRAM_LOGIN_ENABLED=true
VITE_META_PAGES_OAUTH_ENABLED=false
```

Do **not** change WhatsApp Embedded Signup flags for this rollout.

## Safe rollback (disable public OAuth without wiping credentials)

1. Set `META_MESSENGER_OAUTH_ENABLED=false` and `META_INSTAGRAM_LOGIN_ENABLED=false` on the API host; restart API only.
2. Optionally set allowlists back to empty (deny-all) — not required if enablement is off.
3. Redeploy FE with `VITE_META_*_OAUTH/LOGIN_ENABLED=false` when convenient so Connect buttons stay hidden.
4. **Do not** delete `company_messenger_settings` / `company_instagram_settings` rows or clear encrypted secrets.
5. **Do not** use Contabo release rollback solely to turn OAuth off (that restarts/repoints whole API/FE releases).

Existing `manual` and `oauth` connections remain intact; Connect/start APIs return disabled / not ready.

## Recommended sequence

1. Confirm Meta App Review + Advanced Access + Production redirect URIs.
2. Deploy API build that includes the `*` allowlist parser (flags still **false**).
3. Verify App ID/Secret/state/public base presence (names only).
4. Enable server flags + set allowlists to `*`; restart API.
5. Deploy FE with VITE OAuth bake **true**.
6. Smoke: entitled company can start OAuth; non-entitled gets commercial 403; ValueOR manual Messenger still requires confirm-to-replace.

## Related

- Safeguards overview: `docs/operations/meta-oauth-safeguards-local.md`
- Env template: `deploy/vps/production.env.example`
