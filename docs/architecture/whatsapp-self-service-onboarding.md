# WhatsApp Self-Service Onboarding (Embedded Signup + Coexistence)

Development-only documentation for ValueOR dual-path WhatsApp onboarding.
`VALUEOR_ENV=local` only. No Production deployment claims.

## What already worked (reused)

- Manual WhatsApp Settings UI, encrypted credential RPCs (`upsert_company_whatsapp_settings`, `get_company_whatsapp_settings` / decrypted variants), `sync_whatsapp_channel_references`.
- Runtime: `resolveWhatsAppRuntimeConfiguration`, `WhatsAppCloudAdapter`, webhook verification + signature checks, Omnichannel inbound/outbound pipelines, `company_channels`, entitlement `whatsapp_channel`, RBAC.
- Embedded Signup scaffolding: session/complete/status routes, signed OAuth `state` (CSRF + company bind), WABA subscribe helper (flag-gated), UI feature flags.

## What was newly implemented

### Option A — Connect existing WhatsApp Business (Coexistence)

- Session `onboardingMode: "coexistence"` returns Meta `featureType: "whatsapp_business_app_onboarding"` only when `WHATSAPP_COEXISTENCE_ENABLED=true`.
- UI launches Meta Embedded Signup with that `featureType`. **Meta owns any QR**; ValueOR never fabricates QR codes and never uses WhatsApp Web pairing.
- Copy explains consent, history limits, and that not every historical chat/group/media may sync.

### Option B — Connect a new Cloud API number

- Session `onboardingMode: "cloud_api_new"` (default) with `featureType: null`.
- Same complete path: code exchange → persist token + Meta app secret → channel sync → optional WABA subscribe → Graph phone probe.
- Copy states Cloud API–only numbers are **not** simultaneous WhatsApp Business App usage (unlike Coexistence).

### History / Coexistence webhook safety

- `parseWhatsAppWebhookEvents` marks `history`, `smb_message_echoes`, `smb_app_state_sync` (and nested history/echo buckets) as `historySync`.
- Adapter emits `message.history`; `ChannelRouter` persists with `executeAi: false` (no AI / autoresponders / customer notifications as “new” inbound).
- After Coexistence complete: server resolves `phone_number_id` from WABA when Meta’s FINISH event only returns `waba_id`, skips Cloud API `/register`, and POSTs Meta `smb_app_data` for `smb_app_state_sync` + `history` (official 24h sync window).

### UI

- Dual-option panel always mounted on Company Settings → WhatsApp.
- Flag-off state explains how to enable Development flags.
- Onboarding status (phone_number_id / WABA), replace-existing confirm, soft disconnect (disable channel) with confirm.
- Locales: English + Arabic RTL. German not present in login-app locale packs (only `en`/`ar`).

## Multi-tenant security (enforced on existing paths)

| Control | Mechanism |
|---------|-----------|
| Company isolation | Auth + `requireCompanyScope("companyId")` + state company bind |
| RBAC / entitlement | `whatsapp_settings_can_manage` + `assertRouteCommercialFeature(..., "whatsapp_channel")` |
| Credential storage | Encrypted via upsert RPC; tokens never returned to frontend |
| CSRF | HMAC-signed Embedded Signup `state` with expiry |
| Cross-tenant phone | Duplicate `phone_number_id` rejected (`ES_PHONE_IN_USE`) |
| Webhooks | Existing signature verification + verify-token challenge |

## Feature flags (Development)

| Flag | Role |
|------|------|
| `WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | Server ES routes |
| `VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | Interactive Meta panel |
| `WHATSAPP_COEXISTENCE_ENABLED` | Option A server session |
| `VITE_WHATSAPP_COEXISTENCE_ENABLED` | Option A CTA |
| `WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE` | WABA subscribed_apps Graph calls |
| `WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE` | Must stay unset/false for Production |
| `META_EMBEDDED_SIGNUP_APP_ID` / `APP_SECRET` | Development Meta app |
| `META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID` | Path B (`cloud_api_new`) FLB configuration ID |
| `META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID` | Path A (`coexistence`) FLB configuration ID (Meta Coexistence capability not assumed) |
| `META_EMBEDDED_SIGNUP_STATE_SECRET` | State HMAC |
| `WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE` | Optional Graph `/register` after complete |

## Meta configuration readiness (no assumed approvals)

ValueOR **cannot** assert Business Verification, App Review, Advanced Access, Coexistence eligibility, or Tech Provider status without the business owner’s Meta dashboard evidence.

Required owner actions (external boundary):

1. Open [Meta Developer App](https://developers.facebook.com/apps/) → WhatsApp product → confirm App Mode (Development vs Live) and publishing status.
2. Confirm Business Verification on the Meta Business Portfolio.
3. Configure Embedded Signup FLB configurations separately when dual-path is intended:
   - Cloud API / standard ES → `META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID`
   - Coexistence / Business App onboarding (only if Meta config is verified capable) → `META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID`
   Session selection never falls back across paths; a missing path ID fails that path only.
4. Add WhatsApp permissions / Advanced Access as required by Meta for production customer onboarding.
5. Enable Coexistence / WhatsApp Business App onboarding in Meta if Option A is intended; then set `WHATSAPP_COEXISTENCE_*` flags in **local** env only. Do not treat a config name containing “Coexistence” as proof of Meta Coexistence support.
6. Subscribe webhook fields including messages, message statuses, and Coexistence-related fields (`history`, `smb_message_echoes`, `smb_app_state_sync`, contacts) to the Development callback URL.
7. Add OAuth redirect / Embedded Signup domains for the local or staging frontend origin.
8. Provide Development App ID + App Secret to local API env (never commit secrets).

Until those steps are evidenced, treat Meta E2E as **not performed**.

## Files touched (implementation)

- `artifacts/login-app/src/components/channels/whatsapp-embedded-signup-panel.tsx`
- `artifacts/login-app/src/lib/channels/whatsapp-embedded-signup-client.ts`
- `artifacts/login-app/src/lib/channels/whatsapp-embedded-signup.ui.test.ts`
- `artifacts/login-app/src/pages/dashboard/settings/whatsapp-settings-page.tsx`
- `artifacts/login-app/src/locales/en/common.json`, `ar/common.json`
- `artifacts/api-server/src/services/whatsapp-embedded-signup.ts` (+ `.test.ts`)
- `artifacts/api-server/src/routes/whatsapp-embedded-signup.ts`
- `lib/channel-platform/src/adapters/whatsapp/whatsapp-api-client.ts`
- `lib/channel-platform/src/adapters/whatsapp/whatsapp-cloud-adapter.ts` (+ `.test.ts`)
- `lib/channel-platform/src/adapters/whatsapp/whatsapp-types.ts`
- `lib/channel-platform/src/router/channel-router.ts`
- `lib/channel-platform/src/constants.ts`
- `docs/architecture/whatsapp-self-service-onboarding.md` (this file)
- `docs/operations/whatsapp-self-service-onboarding-qa.md`
- `docs/operations/whatsapp-meta-owner-checklist.md`

No new Production migrations in this delivery. No git commit/push.
