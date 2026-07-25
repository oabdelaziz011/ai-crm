# Sprint W3.1 — Production WhatsApp Inbound Routing

## Architecture summary

Inbound WhatsApp webhooks now support **phone-number-based routing** while keeping the legacy path-based endpoint for backward compatibility.

### Endpoints

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/api/webhooks/whatsapp` | Meta verification — resolves channel by unique `hub.verify_token` |
| `POST` | `/api/webhooks/whatsapp` | Production ingress — routes by `metadata.phone_number_id` |
| `GET` | `/api/webhooks/whatsapp/:companyChannelId` | Legacy verification (unchanged) |
| `POST` | `/api/webhooks/whatsapp/:companyChannelId` | Legacy ingress with phone lookup + URL fallback |

### Routing algorithm (`resolveWhatsAppWebhookCompanyChannelId`)

1. Parse Meta payload → extract `entry[].changes[].value.metadata.phone_number_id`
2. Query `company_channels` where `configuration->>'phoneNumberId'` matches (WhatsApp channels only)
3. **Exactly one match** → use that `company_channel_id` (overrides legacy URL if they differ)
4. **Zero matches** → fall back to `:companyChannelId` URL param (legacy only)
5. **Multiple matches** → HTTP 409 + structured error log

Signature verification runs **after** channel resolution so the correct channel `appSecret` is used.

### Portal changes

- Displays production callback URL: `{VITE_API_SERVER_URL}/api/webhooks/whatsapp`
- Auto-generates unique `verifyToken` per WhatsApp channel
- Rejects duplicate `phoneNumberId` and `verifyToken` on save (service-level validation)
- Persists `webhook_url` on channel save

## Files changed

| Area | Files |
|------|-------|
| Channel registry | `lib/channel-registry/src/repositories/company-channel-repository.ts`, `supabase-company-channel-repository.ts`, `company-channel-service.ts`, `utils/whatsapp-channel-utils.ts`, `index.ts` |
| Channel platform | `lib/channel-platform/src/webhooks/whatsapp-webhook-routing.ts`, `whatsapp-webhook-handler.ts`, `ports/channel-platform-ports.ts`, `test-utils.ts`, `index.ts` |
| API server | `artifacts/api-server/src/routes/webhooks.ts`, `platform/channel-platform-ports.ts` |
| Portal | `artifacts/login-app/src/pages/dashboard/channels/channels-page.tsx`, `lib/channels/whatsapp-channel-utils.ts`, `lib/channel-platform/platform-ports.ts`, `locales/en/common.json`, `locales/ar/common.json` |
| Tests | `lib/channel-platform/src/webhooks/whatsapp-webhook-routing.test.ts` |
| Config | `.env.example` |

## Migration requirements

**No migration required** for routing to work — lookup uses existing JSONB `configuration.phoneNumberId`.

**Recommended optional migration** (after cleaning duplicate verify tokens in existing data):

```sql
-- Enforce unique WhatsApp phone number IDs at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_channels_whatsapp_phone_number_id
  ON public.company_channels ((configuration->>'phoneNumberId'))
  WHERE deleted_at IS NULL
    AND configuration->>'phoneNumberId' IS NOT NULL
    AND configuration->>'phoneNumberId' <> '';

-- Enforce unique verify tokens at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_channels_whatsapp_verify_token
  ON public.company_channels ((configuration->>'verifyToken'))
  WHERE deleted_at IS NULL
    AND configuration->>'verifyToken' IS NOT NULL
    AND configuration->>'verifyToken' <> '';
```

**Ops action required:** Update Meta Developer Console callback URL to `/api/webhooks/whatsapp` and assign a unique verify token to each channel (regenerate via Portal if still using shared E2E token).

## Test results

### Unit tests (`lib/channel-platform`)

```
pnpm --dir lib/channel-platform test
```

**19/19 PASS** — includes new routing cases:

- matching phone number → resolved channel
- unknown phone number → URL fallback
- duplicate phone number → rejected
- no phone + no URL → `no_channel`

### WhatsApp E2E (`scripts/whatsapp-e2e-verify.mts`)

- Webhook verification scenario: **PASS**
- Remaining scenarios depend on Enterprise AI Runtime wiring in the login-app test harness (pre-existing environment dependency, unrelated to inbound routing)
- E2E verify token updated to `vault-wa-verify-token-e2e-demo-beta` to avoid collision with production channels under duplicate-token validation
