# VaultOS Enterprise Billing Platform — Impact Analysis v2

**Status:** **APPROVED** — Phase B.1 finalization complete (pending db push + E2E)  
**Version:** 2.1  
**Date:** 2026-07-18  
**Architecture:** [`enterprise-billing-platform-v2.md`](./enterprise-billing-platform-v2.md)  
**Supersedes:** [`enterprise-billing-impact-analysis-v1.md`](./enterprise-billing-impact-analysis-v1.md)

**Implementation:** Blocked until Final Architecture v2 checklist is formally approved.

---

## Revision Summary (v1 → v2)

| # | Revision | Impact |
|---|----------|--------|
| 1 | Workspace as Company Administration Center | New `workspace` section + registry; billing is nested child |
| 2 | Billing vs Financial domain separation | RPC namespaces, orchestrator split, no duplicate tables |
| 3 | Expanded Payment lifecycle | New event/state tables; phased implementation |
| 4 | Notification Bus | Replaces direct email coupling; new bus table |
| 5 | Analytics foundation | `financial_analytics_snapshots` + 8 KPI metrics |
| 6 | Payment Sandbox Mode | Setting + sandbox provider + test cards |
| 7 | Platform route expansion | 10+ new subscription sub-routes |
| 8 | UI naming | Customer vs Subscription Invoices i18n |
| 9 | Testing environment | Seed migration with personas + demo data |
| 10 | Preserve existing architecture | Explicit non-regression guarantees |

---

## 1. Architecture Impact Analysis

### 1.1 Structural change: Workspace shell

**Before (v1):** Standalone Company Billing Portal at `/dashboard/workspace/billing`.

**After (v2):** Company Workspace at `/dashboard/workspace` with Billing as one of eight sections.

```
/dashboard/workspace
├── /                     Overview
├── /members              Members
├── /security             Security
├── /usage                Usage
├── /billing              Billing (self-service)
├── /settings             Settings
├── /api-keys             API Keys
└── /integrations         Integrations
```

**Impact:**
- New `workspace-route-registry.ts` (parallel to billing-route-registry)
- New `WorkspaceLayout` component (parallel to `BillingLayout`)
- New dashboard section `id: "workspace"` in `dashboard-route-registry.ts`
- Billing portal pages move under `pages/dashboard/workspace/billing/`
- Shared panels remain in `components/billing/` — imported by workspace pages

**No impact on:** Platform `/dashboard/subscriptions/*` structure.

### 1.2 Domain separation impact

| Concern | Owner | Change |
|---------|-------|--------|
| Subscription renew side effects | Billing + Financial orchestrator | Refactor to shared `financial.apply_payment_success` |
| Invoice creation | Financial | Unchanged table; clearer RPC ownership |
| Coupon validation | Billing | New tables; billing namespace RPCs |
| Revenue metrics | Financial | New snapshot table + compute job |
| Payment state machine | Payment | Extended `payment_intents` + event log |

**No duplicate code:** Single orchestrator, single set of tables, domain expressed via RPC naming and module docs.

### 1.3 Notification Bus impact

**Before:** RPCs → `billing_email_outbox` directly.

**After:** RPCs → `notification_bus.publish()` → channel subscribers.

| Component | New/Changed |
|-----------|-------------|
| `billing_notification_events` | New (bus) |
| `billing_email_outbox` | Retained as email channel sink |
| `notifications` | Existing — in-app subscriber writes here |
| Billing RPCs | Remove direct email inserts |

### 1.4 Payment Domain expansion impact

New tables (design now, implement phased):

| Table | Phase |
|-------|-------|
| `payment_intent_events` | D (schema), G (populate) |
| `payment_disputes` | H+ |
| `billing_refunds` | G |

State machine columns on `payment_intents` extended for authorization/capture/settlement/dispute states.

### 1.5 Analytics foundation impact

| Deliverable | Phase B |
|-------------|---------|
| `financial_analytics_snapshots` | Table + daily job stub |
| Platform `/subscriptions/revenue` | Basic MRR/ARR |
| Platform `/subscriptions/analytics` | KPI shell for 8 metrics |

Full ARPU/LTV/cohort logic deferred to Phase H+; schema supports all metrics in `metrics jsonb`.

### 1.6 Sandbox mode impact

| Item | Change |
|------|--------|
| `billing_setting_definitions` | Add `payment_sandbox_mode` |
| `payment_providers` | Seed `sandbox` provider (active in non-prod) |
| Payment Service | SandboxAdapter as default in dev/staging |
| Demo seed | Sandbox enabled by default |

---

## 2. Database Impact Analysis

### 2.1 Migration plan (047+)

| Migration | Contents |
|-----------|----------|
| **047** | `profiles.account_status`; workspace/billing permission seeds; `billing_notification_events`; `payment_sandbox_mode` setting; sandbox provider seed |
| **048** | `financial_analytics_snapshots`; revenue compute function stub |
| **049** | `billing_coupons`, `billing_coupon_redemptions` |
| **050** | Extend `payment_intents` (lifecycle columns); `payment_intent_events` |
| **051** | Extend `company_billing_profiles` (VAT, CR, country, city, timezone, currency) |
| **052** | `billing_refunds` |
| **053** | `billing_email_outbox` (email channel — fed by bus only) |
| **054** | `billing_scheduled_jobs`, `billing_job_executions` |
| **055** | `payment_disputes` (schema only) |
| **099** | Demo/testing seed (idempotent) |

**Existing migrations 030–046:** Immutable.

### 2.2 RPC namespace convention

```
billing.*      — subscriptions, plans, usage, entitlements, coupons, settings
financial.*    — payments, invoices, receipts, refunds, revenue, analytics
payment.*      — intents, providers, sandbox, webhooks
notification.* — bus publish, channel enqueue
workspace.*    — portal summary, company-scoped reads (may wrap billing.*)
platform.*     — cross-tenant lists (or retain existing names with platform gate)
```

Existing public RPC names **preserved** — new RPCs follow convention; old RPCs not renamed (backward compatibility).

### 2.3 Shared orchestrator (refactor, not duplicate)

```
financial.apply_payment_success(p_intent_id)
  ← confirm_checkout_payment (workspace)
  ← renew_subscription_from_payment (platform — internal refactor)
  ← payment webhook handler (Phase G)
```

---

## 3. UI Impact Analysis

### 3.1 New UI surfaces

| Surface | Files (proposed) | Reuse |
|---------|------------------|-------|
| Workspace layout | `workspace-layout.tsx`, `workspace-route-registry.ts`, `workspace-sub-nav.tsx` | Mirror billing layout pattern |
| Workspace overview | `workspace-overview-page.tsx` | `DashboardCard`, KPI grid |
| Workspace billing | `workspace/billing/*` | All `components/billing/panels/*` |
| Platform financial lists | `billing-payments-page.tsx`, etc. | `BillingToolbar`, `BillingPagination` |
| Platform analytics | `billing-revenue-page.tsx`, `billing-analytics-page.tsx` | `reports-page` chart patterns |
| Renewal wizard | `workspace/billing/renew/*` | Stepper component |

### 3.2 i18n changes (§8)

| Key | EN label |
|-----|----------|
| `navigation.invoices` | Customer Invoices (verify/clarify) |
| `billing.nav.subscriptionInvoices` | Subscription Invoices |
| `billing.workspace.documents.subscriptionInvoices` | Subscription Invoices |
| `navigation.workspace` | Workspace |
| `workspace.nav.*` | Overview, Members, Security, Usage, Billing, Settings, API Keys, Integrations |

### 3.3 Platform pages — extend, not redesign

| Page | Change |
|------|--------|
| `billing-overview-page.tsx` | Add revenue KPI chips (additive) |
| `billing-settings-page.tsx` | Add sandbox mode toggle |
| `subscription-detail-page.tsx` | No structural change |
| `billing-audit-log-page.tsx` | No change |
| `billing-settings-page.tsx` | No layout change |

### 3.4 BLOCKED_BILLING_PATHS removal schedule

| Path | Phase | Replace redirect with |
|------|-------|----------------------|
| `/payments` | B | `billing-payments-page` |
| `/invoices` | B | `billing-invoices-page` (Subscription Invoices) |
| `/reports` | B | Redirect to `/analytics` or merge |
| `/companies` | B | `billing-companies-page` |
| `/plans` | G | `billing-plans-admin-page` |
| `/list` | — | Remove (overview serves this) |

New routes not in blocked list: `/receipts`, `/refunds`, `/revenue`, `/providers`, `/analytics`, `/renewals`, `/expirations`, `/failures`.

---

## 4. Security Impact Analysis

### 4.1 Workspace security model

| Check | Implementation |
|-------|----------------|
| Workspace access | `workspace.view` or `billing.view_own` + company admin |
| Workspace billing mutations | `billing.manage_own` |
| Cross-tenant | Impossible via workspace RPCs (`current_company_id()` only) |
| Platform financial lists | `is_platform_billing_operator()` |

### 4.2 Sandbox security

| Risk | Mitigation |
|------|------------|
| Sandbox in production | `payment_sandbox_mode` platform setting; warn in UI; disable provider registry swap in prod without super-admin |
| Fake payments counted as revenue | Analytics job tags sandbox payments via `provider = 'sandbox'`; exclude from production revenue views |

### 4.3 Notification Bus security

| Risk | Mitigation |
|------|------------|
| PII in webhook payload | Payload schema validation; redaction rules per channel |
| Email spam | Rate limits on bus publish per company |

### 4.4 No regression

- Phase 1 RLS policies unchanged
- Existing audit immutability unchanged
- Export permission gates unchanged

---

## 5. Performance Impact Analysis

### 5.1 Workspace landing

Single RPC: `workspace.get_billing_summary` or `get_workspace_portal_summary` — aggregates billing slice for `/workspace/billing` without N+1.

### 5.2 Analytics

| Approach | Rationale |
|----------|-----------|
| Pre-computed snapshots | MRR/ARR/LTV at scale |
| Daily batch | Acceptable lag for platform dashboards |
| Live subscription counts | Keep on existing overview RPC |

### 5.3 Notification Bus

Async channel processing — RPC publishes to bus in same transaction; workers process out-of-band. No SMTP latency in RPC path.

---

## 6. Backward Compatibility Report

| Item | Compatible | Notes |
|------|------------|-------|
| `/dashboard/subscriptions/*` | ✅ | URLs preserved |
| Phase 1 RPCs | ✅ | Signatures unchanged |
| `renew_subscription_from_payment` | ✅ | Internal refactor to shared orchestrator |
| CRM Customer Invoices | ✅ | Route + table unchanged |
| Migration 045/046 client compat | ✅ | Degraded-mode helpers remain |
| `subscriptions` sidebar entry | ✅ | Unchanged |
| Existing hooks | ✅ | Path-agnostic; reusable |

| Item | Additive change |
|------|-----------------|
| Sidebar | + Workspace entry for Company Admins |
| i18n | + workspace keys; clarify invoice labels |
| Permissions | + workspace.* / billing.manage_own seeds |

**Breaking change risk: NONE**

---

## 7. Risk Assessment (updated)

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Workspace + billing registry complexity | Medium | Medium | Mirror proven billing layout pattern exactly |
| R2 | Domain separation confusion in code reviews | Medium | Medium | RPC namespace lint/doc; architect review gate |
| R3 | Notification bus over-engineering for Phase B | Medium | Low | Bus table + inline in-app subscriber only in B; email worker Phase G |
| R4 | Sandbox payments in revenue metrics | Low | High | Filter `provider != 'sandbox'` in analytics |
| R5 | Payment lifecycle schema unused until Phase G | Low | Low | Document phased activation; nullable columns |
| R6 | Demo seed drift from schema | Medium | Medium | Seed migration in CI; idempotent upserts |
| R7 | Cross-tenant leak in platform financial RPCs | Medium | Critical | Platform gate + tests |
| R8 | Scope creep (Workspace Members/Security before billing MVP) | High | Medium | Phase B ships Overview + Usage + Billing shells only |

**Critical risks mitigated.** Residual risk: **Acceptable**.

---

## 8. Testing Architecture Impact

### 8.1 Deliverable

**File:** `supabase/seed/billing-demo-environment.sql` or migration `099_billing_demo_environment.sql`

### 8.2 Seed contents checklist

- [ ] Platform Owner user + super admin
- [ ] 3+ demo companies (Alpha trial, Beta professional, Gamma enterprise)
- [ ] Expired subscription company
- [ ] Suspended subscription company
- [ ] Company Admin per company
- [ ] Finance Manager role assignment
- [ ] Employee with read-only `billing.view_own`
- [ ] Sample payments (succeeded, failed, sandbox)
- [ ] Sample Subscription Invoices (multiple statuses)
- [ ] Sample receipts
- [ ] Sample billing audit logs
- [ ] Usage snapshots populated
- [ ] Entitlements per plan
- [ ] `payment_sandbox_mode = true`
- [ ] Test coupon `DEMO20`

### 8.3 CI integration

- Optional: `npm run test:billing-e2e` against local Supabase with seed applied
- Document in README: `supabase db reset` applies migrations + seed

---

## 9. Final Implementation Checklist

### Gate 0 — Formal approval of v2 package

- [x] [`enterprise-billing-platform-v2.md`](./enterprise-billing-platform-v2.md) approved
- [x] This impact analysis v2 approved
- [x] All §15 checklist items in architecture v2 confirmed

### Phase B deliverables

**Database:**
- [x] 047: account_status, notification bus, sandbox setting/provider, permissions
- [x] 048: financial_analytics_snapshots
- [x] 049: in-app notification subscriber (bus → notifications)
- [x] 050: notification bus publisher wiring + RBAC role_permissions (047)
- [x] 099: demo seed environment (Enterprise §9 — coupons deferred)

**Workspace:**
- [x] workspace-route-registry + layout
- [x] Pages: Overview, Usage, Billing (read shell)
- [x] Hooks: `hooks/workspace/*`

**Platform:**
- [x] Unblock + ship: payments, invoices, receipts, renewals, expirations, failures, revenue
- [x] Analytics shell page
- [x] Provider Health page (§20 refinement)
- [x] Overview KPI extension (additive)

**Cross-cutting:**
- [x] i18n: workspace + Subscription Invoices naming (EN + AR)
- [x] Notification bus publish helper (RPC + `notification-bus.ts`)
- [x] In-app notification subscriber (migration 049)
- [x] Publisher wiring on mutation RPCs (migration 050)
- [x] RBAC role_permissions for 047 permissions (migration 050 + 099 demo roles)

**Verification:**
- [ ] Demo seed E2E: Platform Owner sees analytics; Company Admin sees workspace billing
- [x] No regression: Phase 1 platform billing flows (build passes)
- [x] `npm run build` passes

### Phases C–H

See architecture v2 §13 for full roadmap.

---

## 10. Document Index (Final Package)

| Document | Role | Status |
|----------|------|--------|
| [`billing-subscriptions.md`](./billing-subscriptions.md) | Parent v4 domain contract | Reference (extend in v2) |
| [`enterprise-billing-platform-v2.md`](./enterprise-billing-platform-v2.md) | **Final architecture** | **Approved v2.1** |
| [`enterprise-billing-impact-analysis-v2.md`](./enterprise-billing-impact-analysis-v2.md) | **Final impact analysis** | **Approved — Phase B.1 complete (pending db push)** |
| [`phase-b1-verification-report.md`](./phase-b1-verification-report.md) | **Phase B.1 verification** | **Complete — pending db push** |
| `company-billing-portal-v1.md` | Superseded | Archive |
| `enterprise-billing-impact-analysis-v1.md` | Superseded | Archive |

---

*End of Impact Analysis v2.*
