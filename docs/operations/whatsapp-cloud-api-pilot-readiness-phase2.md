# WhatsApp Cloud API — Commercial Pilot Readiness (Phase 2)

**Branch:** `feature/wa-embedded-signup-v4`  
**Baseline:** `bc5125d888481ca922816076636faea7d9fa0eef`  
**Scope:** Cloud API Embedded Signup v4 pilot readiness only. Coexistence remains closed.  
**Hard rules:** No Production deploy, no Production env edits, no public allowlist open, no migrations.

This document does **not** claim Meta Access Verification, App Review, or live v4 Production compatibility unless separately evidenced in the Meta dashboard.

---

## 1. Environment configuration checklist

Values must never be committed or pasted into tickets. Names only.

### Required for Cloud API Embedded Signup (Option B)

| Variable | Role | Default / pilot note |
|---|---|---|
| `WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | Master API gate | Keep `false` until pilot start |
| `VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | UI gate (build-time) | Keep `false` until pilot FE build |
| `WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS` | Deny-by-default company UUID allowlist | Empty = deny all; set **one** pilot company UUID only when starting E2E |
| `META_EMBEDDED_SIGNUP_APP_ID` | Meta App ID | Required |
| `META_EMBEDDED_SIGNUP_APP_SECRET` | App secret for code exchange + tenant webhook HMAC persist | Required; never log |
| `META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID` | Facebook Login for Business **v4** Cloud API configuration | Required; no fake default |
| `META_EMBEDDED_SIGNUP_STATE_SECRET` | CSRF/state HMAC | Required (or falls back to app secret — prefer dedicated) |
| `META_EMBEDDED_SIGNUP_GRAPH_VERSION` | Graph version for SDK/exchange | e.g. `v21.0` (confirm against Meta) |
| `PUBLIC_WEBHOOK_BASE_URL` / webhook base | Builds callback URL only when company has none | Do **not** change Production webhook URL casually |
| Commercial entitlement `whatsapp_channel` | Route gate | Pilot company must be entitled |

### Optional Cloud API (keep off for Production pilot unless intentionally tested)

| Variable | Role |
|---|---|
| `WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE` | Graph WABA subscribe after complete (default off) |
| `WHATSAPP_EMBEDDED_SIGNUP_ALLOW_PRODUCTION_SUBSCRIBE` | Required in addition when `NODE_ENV=production` |
| `WHATSAPP_EMBEDDED_SIGNUP_REGISTER_PHONE` | POST `/{phone-number-id}/register` (default off) |
| `WHATSAPP_EMBEDDED_SIGNUP_REGISTRATION_PIN` | Required 6-digit PIN **only if** register-phone is on — never `000000` default |

### Coexistence-only (Phase 2: leave unset / false)

| Variable | Role |
|---|---|
| `WHATSAPP_COEXISTENCE_ENABLED` | Server Coexistence path |
| `VITE_WHATSAPP_COEXISTENCE_ENABLED` | UI Coexistence CTA |
| `META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID` | Separate FLB v4 Coexistence configuration |

### Explicitly unused / forbidden for v4

| Variable | Note |
|---|---|
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Legacy single ID — **do not use** as Cloud/Coexistence fallback |

---

## 2. Meta Dashboard requirements (evidence required)

1. Facebook Login for Business **v4** configuration for Cloud API Embedded Signup; copy Configuration ID.  
2. Products/permissions selected **in that configuration** (not via JS `sessionInfoVersion`).  
3. App domains / JS SDK origins include the pilot frontend host (`valueor.org` and/or `app.valueor.org`).  
4. Access Verification / Tech Provider path as Meta currently requires for third-party onboarding.  
5. Advanced Access for `whatsapp_business_messaging` and `whatsapp_business_management` if Meta requires it for the pilot app mode.  
6. Privacy Policy + Terms + data deletion instructions URLs acceptable to App Review.  
7. WABA webhook fields for Cloud API messaging (`messages` / statuses at minimum).  
8. Do **not** claim Live/Published or Access Verification complete without a current screenshot.

---

## 3. Pilot E2E test plan — new independent company (Cloud API)

**Prerequisites:** Phase 2 branch deployed only to a **non-production** or isolated staging stack, **or** a tightly controlled pilot allowlist on Production **only after** explicit operator approval (out of scope for this phase’s execution). This plan is the checklist; execution is gated.

### Gate 0 — Safety

- [ ] ValueOR Production number inbound/outbound still healthy **before** any flag change.  
- [ ] Allowlist empty except the single pilot company UUID (when enabling).  
- [ ] `WHATSAPP_COEXISTENCE_ENABLED=false`.  
- [ ] AUTO_SUBSCRIBE / ALLOW_PRODUCTION_SUBSCRIBE remain false unless subscribe step is intentionally in scope.  
- [ ] No change to Production webhook URL / verify token for the ValueOR-owned number.

### Gate 1 — RBAC / entitlement

- [ ] Pilot user has company scope for the pilot company.  
- [ ] User can open Settings → WhatsApp.  
- [ ] Company has commercial feature `whatsapp_channel`.  
- [ ] Company UUID is on `WHATSAPP_EMBEDDED_SIGNUP_ALLOWED_COMPANY_IDS`.  
- [ ] Unrelated company UUID receives `ES_COMPANY_NOT_ALLOWED` / localized denial.

### Gate 2 — Session / OAuth launch (v4)

- [ ] `POST /whatsapp/embedded-signup/session` with `onboardingMode=cloud_api_new` returns `embeddedSignupVersion:"v4"`, `configId`, `launchExtras:{setup:{}}` (no `sessionInfoVersion`).  
- [ ] FB.login opens with that `config_id` and server `launchExtras`.  
- [ ] Missing Cloud CONFIG_ID returns clear closed-feature error (EN + AR).

### Gate 3 — Meta asset selection

- [ ] Operator completes Meta UI: Business Portfolio → WABA → phone number.  
- [ ] Browser receives `WA_EMBEDDED_SIGNUP` session info with `waba_id` + `phone_number_id`.  
- [ ] Authorization `code` returned to ValueOR complete endpoint.

### Gate 4 — Complete / persist

- [ ] State HMAC validates; cross-company state rejected.  
- [ ] Code exchange succeeds; token encrypted via `upsert_company_whatsapp_settings`.  
- [ ] `sync_whatsapp_channel_references` creates/updates company channel.  
- [ ] Existing verify token / callback URL for an already-configured company are not casually rotated.  
- [ ] Duplicate complete with same phone+WABA is idempotent (`already_persisted`).  
- [ ] Different existing connection without `replaceExisting` → `ES_CONNECTION_EXISTS`.

### Gate 5 — Registration (only if flag on)

- [ ] Without PIN → `ES_REGISTER_PIN_MISSING`.  
- [ ] With PIN → Graph register success or surfaced `ES_REGISTER_FAILED` (not swallowed).

### Gate 6 — Webhook subscription (only if flags on)

- [ ] Flag off → `skipped_flag_off`, credentials still persisted.  
- [ ] Flag on + failure → `ES_WEBHOOK_SUBSCRIBE_FAILED` with clear copy.  
- [ ] When subscribed: Meta test message hits ValueOR webhook for **pilot** phone_number_id only.

### Gate 7 — First inbound + reply

- [ ] Customer sends first WhatsApp message to the **pilot** number.  
- [ ] Message appears in Omnichannel for the pilot company only (tenant isolation).  
- [ ] Agent with `conversation.reply` **or** `ai.conversations.reply` can reply.  
- [ ] Delivery status updates observed.  
- [ ] ValueOR Production number path still healthy **after** the test.

### Gate 8 — Known Meta failure UX

- [ ] Force/observe Meta `2655122` (number already Cloud API / cannot Coexistence-pair): UI shows localized `metaNumberAlreadyCloudApi` (EN+AR); no invented “delete WABA” guidance.  
- [ ] Cancelled popup shows cancelled copy, not a false success.

---

## 4. Connect → Connected UX notes

Happy path toast: Embedded Signup success; if Graph probe fails, show connection-test pending.  
Errors map through `resolveEmbeddedSignupErrorPresentation` to EN/AR strings for allowlist, config missing, 2655122, 2655093, register/subscribe failures, and state/code exchange issues.

---

## 5. Next-phase file candidates (not done here)

- History / `smb_*` webhook ingest (Coexistence).  
- Dedicated subscribe-retry admin action.  
- Vercel `app.valueor.org` FE parity deploy.  
- Meta data-deletion callback if App Review requires it.  
- Live Meta dashboard evidence pack (screenshots).
