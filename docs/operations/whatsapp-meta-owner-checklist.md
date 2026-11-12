# Meta Owner Actions — WhatsApp Self-Service Onboarding

Stop here for any step that requires Meta login / form submission. Engineering cannot complete these without the business owner.

Development app for ValueOR local E2E: **ValueOR Local Test**  
App ID (public): `1400885884891475`  
Business portfolio: **Value Or Software Business Solutions** (`130640986136345`)  
Official Coexistence docs: [Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)

## Status snapshot (2026-11-11)

| Item | Status |
|------|--------|
| Access Verification | **BLOCKED** — Start verification still shown |
| App mode | **VERIFIED** Development / unpublished |
| FLB Cloud API CONFIG ID | Owner mapping candidate — set `META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID` locally only |
| FLB Coexistence CONFIG ID | Candidate only — Meta capability NOT VERIFIED; set `META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID` only after dashboard proof |
| App Secret in local env | **BLOCKED** — not supplied |
| Local `META_EMBEDDED_SIGNUP_APP_ID` | **VERIFIED** written to `.env.localstack` |
| Local state secret | **VERIFIED** generated locally |
| Server ES flags enabled | **BLOCKED** until secret+config present |

## Exact owner steps (in order)

### 1. Access Verification (blocking)

1. Open https://developers.facebook.com/130640986136345/access-verification/
2. Click **بدء التحقق** / **Start verification**.
3. Complete the Tech Provider / access questionnaire for **Value Or Software Business Solutions**.
4. Save a screenshot of the completed/approved state.
5. Evidence of pending state: `whatsapp-onboarding-screenshots/meta-access-verification-pending.png`.

Meta’s Coexistence docs require you to already be a **Solution Partner or Tech Provider**. Access Verification is the gate for that path.

### 2. Create Facebook Login for Business configuration (CONFIG_ID)

1. Open https://developers.facebook.com/apps/1400885884891475/business-login/configurations/
2. Click **إنشاء تكوين** / **Create configuration** (or Create from template for WhatsApp Embedded Signup / Cloud API).
3. Select products required for WhatsApp Embedded Signup (WhatsApp / Cloud API as Meta’s current UI lists).
4. For Coexistence / v4: prefer a configuration that supports `whatsapp_business_app_onboarding` (see Meta Embedded Signup versions docs).
5. Copy the resulting **Configuration ID**.
6. Tell engineering (or paste into local `.env.localstack` yourself):
   ```
   META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID=<paste-cloud-api-flb-config-id>
   META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID=<paste-coexistence-flb-config-id-only-if-meta-verified>
   ```
7. Evidence that this page is currently empty: `meta-local-test-flb-configurations.png`.

### 3. Paste Development App Secret (never commit)

1. App Dashboard → إعدادات التطبيق → أساسي / App settings → Basic.
2. Show **App Secret** for **ValueOR Local Test** only (not Production apps).
3. Set in **local** `.env.localstack` (ignored by git):
   ```
   META_EMBEDDED_SIGNUP_APP_SECRET=<paste>
   ```
4. Do **not** paste into chat, tickets, or commits.

### 4. Domains / Valid OAuth redirect URIs

1. Facebook Login for Business settings: allow Development frontend origin `http://localhost:5173` (and `http://127.0.0.1:5173` if Meta requires host-exact match).
2. Embedded Signup / JS SDK origins must include the local Vite origin used for DEMO testing.

### 5. WhatsApp webhook subscriptions (after Access Verification)

In App Dashboard → WhatsApp → Configuration (or current equivalent):

Subscribe Messaging account fields (in addition to `messages` / statuses):

- `account_update`
- `history`
- `smb_app_state_sync`
- `smb_message_echoes`

Callback URL (Development tunnel already used locally):  
`https://webhook-omar.valueor.org/api/webhooks/whatsapp`  
(or the exact URL shown in ValueOR Settings → WhatsApp)

Verify token must match the company webhook verify token stored in ValueOR.

### 6. Enable local server flags (after 2+3)

In `.env.localstack` then restart local API:

```
WHATSAPP_EMBEDDED_SIGNUP_ENABLED=true
WHATSAPP_COEXISTENCE_ENABLED=true
WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE=true
WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE=false
WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE=false
```

Keep `REGISTER_PHONE=false` for Coexistence (Meta: skip register for Business App numbers).  
For Option B only, temporarily set `REGISTER_PHONE=true` if Graph registration is still required for that test number.

### 7. Smoke E2E (authorized Development numbers only)

**Option B — new Cloud API number**

1. Settings → WhatsApp → Start Cloud API signup.
2. Complete Meta phone SMS/voice verification.
3. Confirm Settings shows `phone_number_id` + Connection test OK.
4. Send/receive with an authorized test recipient.

**Option A — Coexistence**

1. Settings → WhatsApp → Start Coexistence signup.
2. Complete Meta flow; scan **only** the Meta-presented QR in WhatsApp Business App ≥ 2.24.17.
3. Confirm consent for history/contacts sharing.
4. Confirm ValueOR stores credentials; webhook subscribe succeeds.
5. Confirm history webhooks import without AI/autoresponders.
6. Confirm new inbound + outbound + `smb_message_echoes`.

## Evidence to attach when done

- Access Verification approved screenshot
- FLB configuration ID screenshot
- Webhook subscription fields screenshot
- Option A success (no fabricated QR)
- Option B success
- Sanitized connection-test / webhook ingress logs (no tokens)
