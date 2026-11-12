# WhatsApp Self-Service Onboarding — QA Evidence (Development)

Date: 2026-11-11 (Meta activation pass)  
Environment: `VALUEOR_ENV=local` only. No Production credentials or customer data.

Status legend: **VERIFIED** | **BLOCKED** | **NOT TESTED**

## Phase 1 — Implementation readiness

| Capability | Status | Evidence |
|------------|--------|----------|
| Dual-option Embedded Signup UI | **VERIFIED** | UI contracts 8/8; screenshot `option-a-and-b-dual-onboarding.png` |
| Coexistence `featureType: whatsapp_business_app_onboarding` | **VERIFIED** (code) | Session unit test; Meta docs require Tech Provider |
| Meta-owned QR only (no ValueOR QR) | **VERIFIED** (code/UI) | UI contract asserts no QR generator |
| OAuth state CSRF + company bind | **VERIFIED** | ES service unit tests |
| Token exchange + encrypted persist + app secret | **VERIFIED** (unit) | Persist test asserts `p_app_secret` |
| WABA subscribe helper (flag-gated) | **VERIFIED** (unit) | 16/16 subscribe tests |
| Phone register | **VERIFIED** (code) | Option B only; Coexistence skips register per Meta |
| Coexistence phone resolve from WABA | **VERIFIED** (unit) | New test: empty phone → Graph `/phone_numbers` |
| Coexistence `smb_app_data` contacts+history trigger | **VERIFIED** (unit) | New test posts both sync types |
| Webhook history / `smb_message_echoes` ingest | **VERIFIED** (unit) | Adapter historySync → `message.history`, AI off |
| Tenant isolation / RBAC / entitlement | **VERIFIED** (unit + UI) | Cross-company state, `ES_PHONE_IN_USE`, settings.edit denial |
| Soft disconnect | **VERIFIED** (code/UI) | Confirm → `enabled: false` |
| Live Meta Embedded Signup popup | **BLOCKED** | Missing CONFIG_ID + APP_SECRET + Access Verification |
| Live webhook from Meta → local | **NOT TESTED** | Requires subscribe + reachable Dev webhook after Meta ready |
| Option A real QR / history E2E | **BLOCKED** | Owner Meta steps incomplete |
| Option B real phone verify E2E | **BLOCKED** | Same |

## Automated tests (this pass)

| Suite | Result |
|-------|--------|
| `whatsapp-embedded-signup.test.ts` | **13/13 pass** (includes Coexistence phone resolve + smb_app_data) |
| Prior UI / adapter / subscribe suites | Still green from previous pass (not re-run this pass to conserve RAM) |

## Local Development Meta env (presence only)

| Key | Status |
|-----|--------|
| `META_EMBEDDED_SIGNUP_APP_ID` | **SET** → Development app **ValueOR Local Test** `1400885884891475` |
| `META_EMBEDDED_SIGNUP_STATE_SECRET` | **SET** (local-generated, not printed) |
| `META_EMBEDDED_SIGNUP_GRAPH_VERSION` | **SET** `v21.0` |
| `META_EMBEDDED_SIGNUP_APP_SECRET` | **MISSING** — owner must paste Development App Secret |
| `META_EMBEDDED_SIGNUP_CLOUD_API_CONFIG_ID` | Set locally for Path B only — never fall back to Coexistence ID |
| `META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID` | Set locally for Path A only after Meta Coexistence capability is verified — never fall back to Cloud API ID |
| `WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | **false** (correct until secret+config present) |
| `WHATSAPP_COEXISTENCE_ENABLED` | **false** |
| `VITE_WHATSAPP_EMBEDDED_SIGNUP_ENABLED` | **true** (UI) |
| `WEBHOOK_BASE_URL` | Local tunnel `https://webhook-omar.valueor.org` (Dev) |

`ensure-localstack-env.mjs` now **preserves** Meta/WhatsApp ES keys across regenerate.

## Meta dashboard evidence (ValueOR Local Test)

Portfolio: Value Or Software Business Solutions (`130640986136345`).

| Check | Status | Evidence |
|-------|--------|----------|
| App exists (Development) | **VERIFIED** | App ID `1400885884891475`, status **غير منشور** / unpublished |
| WhatsApp use case present | **VERIFIED** | Dashboard checklist green for WhatsApp customize |
| Facebook Login for Business product | **VERIFIED** | Dashboard checklist green |
| Business Verification (app checklist) | **VERIFIED** (checklist mark) | Dashboard green; does **not** replace Access Verification |
| FLB Embedded Signup **configuration** | **BLOCKED** | Configurations page empty — Create configuration required (`meta-local-test-flb-configurations.png`) |
| Access Verification (Tech Provider) | **BLOCKED** | Start verification CTA still present (`meta-access-verification-pending.png`) |
| Testing requirements / App Review / Publish | Incomplete | Expected for Dev; Live publish **NOT** required for Dev E2E |
| Coexistence eligibility (Solution Partner / Tech Provider) | **BLOCKED** | Official Meta docs require Tech Provider/Solution Partner + Access Verification |
| Webhook field subscriptions (`history`, `smb_message_echoes`, `smb_app_state_sync`) | **NOT TESTED** | Must be confirmed in App Dashboard after Access Verification |

Screenshots: `docs/operations/whatsapp-onboarding-screenshots/`.

## Phase 4 Real Meta E2E

**Stopped at owner boundary.** Do not simulate Meta success.

Exact owner actions: see `whatsapp-meta-owner-checklist.md`.

After owner supplies `APP_SECRET` + `CONFIG_ID` and completes Access Verification:

1. Set `WHATSAPP_EMBEDDED_SIGNUP_ENABLED=true`, `WHATSAPP_COEXISTENCE_ENABLED=true` (for Option A), `WHATSAPP_EMBEDDED_SIGNUP_AUTO_SUBSCRIBE=true` once webhook URL is reachable.
2. Restart local API so flags load.
3. Run Option B then Option A against Development test numbers only.
4. Capture sanitized webhook ingress + Settings connection status.

## Completion criteria

| Criterion | Status |
|-----------|--------|
| Both paths implemented | **VERIFIED** (code) |
| Secure persistence | **VERIFIED** (unit) |
| Company isolation | **VERIFIED** (unit) |
| History-safe Omnichannel path | **VERIFIED** (unit) |
| Real Meta Coexistence / Cloud E2E | **BLOCKED** on Meta owner configuration |
| External approvals documented | **VERIFIED** |
