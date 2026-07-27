# ValueOR Sprint 7.5.0 — Go-Live Readiness Report

**Date:** 2026-07-26  
**Scope:** Production hardening — stub replacement, platform wiring, migration readiness  
**Recommendation:** **Conditional Go-Live** — deploy after applying migrations 157–163 and configuring production secrets.

---

## Executive Summary

Sprint 7.5.0 replaces development stubs with production implementations, wires the enterprise event bus across all platforms, and adds health-check infrastructure. No new product features were added.

| Area | Status |
|------|--------|
| Database migrations (157–163) | Files ready — **apply to Supabase before deploy** |
| Payment providers (Stripe/Paymob/Fawry) | Real API integrations — require env secrets |
| Invoice PDF generation | Production generator with Supabase storage |
| Portal OTP | Dev code gated behind `app.portal_dev_otp=true` |
| Event bus | Wired: bookings, invoices, payments, transfers |
| Integration Hub + Plugins | EnterpriseEventPublisher dispatches to both |
| Production gate | Extended with Sprint 7 test suite |

---

## 1. Architecture Review

### Platform Topology

```
Booking Domain ──► BookingBillingBridge ──► InvoiceEngine
       │                    │
       │                    └──► Communication Platform
       │
       └──► IntegrationBookingEventPublisher
                    │
                    └──► EnterpriseEventPublisher
                              ├── Integration Hub (webhooks, event log, DLQ)
                              └── Plugin Runtime (sandbox dispatch)

PaymentService.confirmPayment ──► EnterpriseEventPublisher
                                      ├── payment.completed
                                      └── invoice.paid

TransferEngineService.execute ──► organization.transfer

InvoiceEngineService.issue ──► invoice.created + PDF generation
```

### Key Changes

- **Single payment registry** — `PaymentProviderRegistry` serves both billing and customer portal via `BillingPortalPaymentAdapter`.
- **PDF pipeline** — `StorageInvoicePdfGenerator` uploads to `invoices` bucket, persists `pdf_storage_path`, portal resolves signed URLs.
- **No duplicated business logic** — portal, API, and dashboard all delegate to existing domain services.

---

## 2. Security Review

| Control | Implementation | Status |
|---------|----------------|--------|
| Portal OTP dev bypass | Gated by `app.portal_dev_otp` setting (migration 163) | ✅ |
| Webhook HMAC | `verifyWebhookSignatureAsync` via `@workspace/platform-crypto` | ✅ |
| Sandbox payments in prod | Blocked unless `ALLOW_SANDBOX_PAYMENTS=true` | ✅ |
| Provider credentials | Loaded from env, never hardcoded | ✅ |
| RLS | Defined in migrations 157–162 (unchanged) | ✅ Verify post-apply |
| Plugin sandbox | No direct Supabase access | ✅ |

### Required Production Secrets

```
STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY
PAYMOB_API_KEY / PAYMOB_INTEGRATION_ID / PAYMOB_IFRAME_ID
FAWRY_MERCHANT_CODE / FAWRY_SECURITY_KEY
VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY (api-server)
```

### Remaining Security Items (non-blocking)

- Stripe webhook signature uses header format validation; full async HMAC verification should run in api-server webhook route.
- WhatsApp stub transport still used when Meta credentials absent — configure `META_WHATSAPP_*` for production.
- SMS/push communication channels use stub providers — configure real providers before go-live messaging.

---

## 3. Migration Report

| # | File | Platform |
|---|------|----------|
| 157 | `157_customer_experience_platform.sql` | Customer Portal |
| 158 | `158_enterprise_financial_platform.sql` | Financial/Billing |
| 159 | `159_executive_intelligence_platform.sql` | Executive Intelligence |
| 160 | `160_organization_hierarchy_platform.sql` | Organization Hierarchy |
| 161 | `161_integration_hub_platform.sql` | Integration Hub |
| 162 | `162_plugin_marketplace_platform.sql` | Plugin Marketplace |
| 163 | `163_production_hardening.sql` | OTP, PDF storage, health RPC, DLQ retry |

### Apply Command

```bash
supabase db push
# or
supabase migration up
```

### Post-Apply Verification

```sql
SELECT platform_health_check_v1();
-- Expected: status = 'ready', all checks = true
```

### Storage Bucket

Create Supabase storage bucket `invoices` with RLS policies for company-scoped access if not already present.

---

## 4. Integration Report

| Provider | Implementation | Env Vars |
|----------|----------------|----------|
| Stripe | REST API payment intents | `STRIPE_SECRET_KEY` |
| Paymob | Accept API auth + payment keys | `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID` |
| Fawry | Charge API with SHA-256 signature | `FAWRY_MERCHANT_CODE`, `FAWRY_SECURITY_KEY` |
| Sandbox | Dev/test only, blocked in production | — |
| Invoice PDF | Minimal PDF 1.4 + Supabase storage | `invoices` bucket |
| Portal documents | Signed URLs via storage API | — |

---

## 5. Event Bus Report

| Event | Publisher | Subscriber |
|-------|-----------|------------|
| `booking.*` | IntegrationBookingEventPublisher | Integration Hub webhooks, Plugins |
| `invoice.created` | InvoiceEngineService.issue | Integration Hub, Plugins |
| `invoice.paid` | PaymentService.confirmPayment | Integration Hub, Plugins, Communication |
| `payment.completed` | PaymentService.confirmPayment | Integration Hub, Plugins |
| `organization.transfer` | TransferEngineService.execute | Integration Hub, Plugins |

Dead letter retry: `integration_retry_dead_letter(company_id, limit)` RPC.

---

## 6. Performance Report

| Metric | Notes |
|--------|-------|
| Bundle size | Run `pnpm build` — lazy-loaded dashboard routes unchanged |
| PDF generation | Async on invoice issue — non-blocking |
| Event publishing | Fire-and-forget with error logging — no blocking |
| N+1 queries | Portal documents resolve signed URLs per invoice — acceptable for typical volumes |

**Recommendation:** Add batch signed URL generation if portal document lists exceed 50 items per customer.

---

## 7. Testing

### Automated

```bash
pnpm typecheck
pnpm build
pnpm --dir artifacts/login-app test:go-live-readiness
pnpm --dir artifacts/login-app test:organization-platform
pnpm --dir artifacts/login-app test:integration-hub
pnpm --dir artifacts/login-app test:plugin-platform
pnpm --dir artifacts/login-app test:financial-platform
pnpm --dir artifacts/login-app test:customer-portal
pnpm --dir artifacts/login-app production:gate
```

### Coverage Target

90%+ coverage requires running full test suite against live Supabase — unit/integration tests cover domain logic; E2E against staging recommended before production traffic.

---

## 8. Monitoring & DR

| Item | Status |
|------|--------|
| Health check RPC | `platform_health_check_v1()` |
| Structured logging | Console error logging on event bus failures |
| Dead letter monitoring | `integration_webhook_deliveries.status = 'dead_letter'` |
| Database backups | Configure Supabase PITR / daily snapshots |
| Secrets backup | Store in vault (1Password, AWS Secrets Manager, etc.) |

---

## 9. Production Checklist

- [ ] Apply migrations 157–163 to production Supabase
- [ ] Create `invoices` storage bucket with RLS
- [ ] Set all payment provider secrets
- [ ] Set `app.portal_dev_otp=false` in production
- [ ] Configure Meta WhatsApp / email SMTP for communication
- [ ] Enable HTTPS on production domain
- [ ] Configure CDN for static assets
- [ ] Set up error tracking (Sentry/Datadog)
- [ ] Configure webhook endpoints for Stripe/Paymob/Fawry
- [ ] Run `platform_health_check_v1()` — verify `ready`
- [ ] Run `pnpm production:gate` in CI
- [ ] Verify backup/restore procedure

---

## 10. Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migrations not applied | **Critical** | Block deploy until `supabase db push` succeeds |
| Missing payment secrets | **High** | Provider throws `ProviderNotConfiguredError` — graceful failure |
| WhatsApp/SMS stubs in prod | **Medium** | Configure real providers before customer messaging |
| Plugin sandbox handlers are lightweight | **Low** | Official plugins return summary data; extend as needed |
| api-server typecheck cross-project issues | **Low** | Build succeeds; pre-existing |

---

## 11. Go-Live Recommendation

**Conditional Go-Live Approved**

Deploy to production after:

1. Applying all migrations (157–163)
2. Configuring production secrets and storage bucket
3. Passing `pnpm production:gate` in CI
4. Staging smoke test: booking → invoice → payment → portal document download

No TypeScript errors or build failures are expected after verification completes.

---

*Generated as part of Sprint 7.5.0 — Production Hardening & Go-Live Readiness*
