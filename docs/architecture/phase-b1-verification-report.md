# Phase B.1 Verification Report (Complete)

**Architecture reference:** [`enterprise-billing-platform-v2.md`](./enterprise-billing-platform-v2.md) v2.1  
**Companion:** [`enterprise-billing-impact-analysis-v2.md`](./enterprise-billing-impact-analysis-v2.md)  
**Report date:** 2026-07-18  
**Scope:** Phase B implementation + Phase B.1 finalization blockers  
**Database status:** Migrations **written, not applied** — `supabase db push` **not authorized / not run**  
**E2E status:** **Not run**

**Overall status: Partially Implemented at runtime** — frontend and migration SQL are complete for Phase B/B.1 scope; live database objects, demo seed data, and E2E verification do not exist until `supabase db push` is approved and executed.

---

## Phase B.1 Blocker Resolution

| # | Blocker | Status |
|---|---------|--------|
| 1 | Complete migration `099` (Enterprise demo environment per §9) | **Implemented** (coupons **Deferred**) |
| 2 | Wire `notification_bus_publish_v1` / internal emit on billing/financial mutations | **Implemented** (catalog-mapped RPCs only) |
| 3 | Seed `role_permissions` for all migration 047 permissions | **Implemented** |
| 4 | Produce this verification report | **Implemented** |

---

## 1. Routes

Status values: **Implemented** | **Partially Implemented** | **Deferred** | **Not Implemented**

### Platform Billing Center (`/dashboard/subscriptions/*`)

| Full path | Registry ID | Status | Notes |
|-----------|-------------|--------|-------|
| `/dashboard/subscriptions` | `overview` | **Implemented** | Phase 1; MRR/ARR KPI row added Phase B |
| `/dashboard/subscriptions/payments` | `payments` | **Implemented** | Requires `list_billing_payments_paged_v1` after db push |
| `/dashboard/subscriptions/invoices` | `invoices` | **Implemented** | Nav: "Subscription Invoices" |
| `/dashboard/subscriptions/receipts` | `receipts` | **Implemented** | |
| `/dashboard/subscriptions/failures` | `failures` | **Implemented** | |
| `/dashboard/subscriptions/renewals` | `renewals` | **Partially Implemented** | Page exists; RPC has no search param; toolbar search ineffective |
| `/dashboard/subscriptions/expirations` | `expirations` | **Partially Implemented** | Same search limitation as renewals |
| `/dashboard/subscriptions/revenue` | `revenue` | **Implemented** | KPI shell via `get_billing_revenue_metrics_v1` |
| `/dashboard/subscriptions/analytics` | `analytics` | **Partially Implemented** | Live metrics only; LTV/churn/collection show "—"; does not read snapshots table |
| `/dashboard/subscriptions/provider-health` | `provider-health` | **Partially Implemented** | Reads seed snapshots; no live probes |
| `/dashboard/subscriptions/settings` | `settings` | **Implemented** | Phase 1 preserved |
| `/dashboard/subscriptions/audit` | `audit` | **Implemented** | Phase 1 preserved |
| `/dashboard/subscriptions/:companyId` | (detail) | **Implemented** | Phase 1 `SubscriptionDetailPage` preserved |

### Blocked Platform routes (redirect → `/dashboard/subscriptions`)

| Full path | Status | Target phase |
|-----------|--------|--------------|
| `/dashboard/subscriptions/companies` | **Deferred** | C+ |
| `/dashboard/subscriptions/plans` | **Deferred** | C+ |
| `/dashboard/subscriptions/list` | **Deferred** | — |
| `/dashboard/subscriptions/reports` | **Deferred** | C+ |
| `/dashboard/subscriptions/refunds` | **Deferred** | G |
| `/dashboard/subscriptions/providers` | **Deferred** | D |

### Company Workspace (`/dashboard/workspace/*`)

| Full path | Registry ID | Status | Notes |
|-----------|-------------|--------|-------|
| `/dashboard/workspace` | `overview` | **Implemented** | Navigation shell |
| `/dashboard/workspace/usage` | `usage` | **Partially Implemented** | Reuses `UsageSummaryPanel`; no dedicated usage RPC |
| `/dashboard/workspace/billing` | `billing` | **Partially Implemented** | Read-only; `get_workspace_billing_summary_v1` |

### Workspace routes not in scope

| Route area | Status |
|------------|--------|
| Members, Security, Settings, API Keys, Integrations | **Not Implemented** (Phase C–G) |

**Registry sources:** `artifacts/login-app/src/config/billing-route-registry.ts`, `workspace-route-registry.ts`, `dashboard-route-registry.ts`

---

## 2. Pages

### Phase B new pages

| File | Export | Status | Notes |
|------|--------|--------|-------|
| `pages/dashboard/billing/billing-payments-page.tsx` | `BillingPaymentsPage` | **Implemented** | Wrapper over shared list |
| `pages/dashboard/billing/billing-invoices-page.tsx` | `BillingInvoicesPage` | **Implemented** | |
| `pages/dashboard/billing/billing-receipts-page.tsx` | `BillingReceiptsPage` | **Implemented** | |
| `pages/dashboard/billing/billing-payment-failures-page.tsx` | `BillingPaymentFailuresPage` | **Implemented** | |
| `pages/dashboard/billing/billing-renewals-page.tsx` | `BillingRenewalsPage` | **Implemented** | |
| `pages/dashboard/billing/billing-expirations-page.tsx` | `BillingExpirationsPage` | **Implemented** | |
| `pages/dashboard/billing/billing-revenue-page.tsx` | `BillingRevenuePage` | **Implemented** | |
| `pages/dashboard/billing/billing-analytics-page.tsx` | `BillingAnalyticsPage` | **Partially Implemented** | Placeholder advanced KPIs |
| `pages/dashboard/billing/billing-provider-health-page.tsx` | `BillingProviderHealthPage` | **Partially Implemented** | Seed/static health data |
| `pages/dashboard/workspace/workspace-overview-page.tsx` | `WorkspaceOverviewPage` | **Implemented** | |
| `pages/dashboard/workspace/workspace-usage-page.tsx` | `WorkspaceUsagePage` | **Partially Implemented** | |
| `pages/dashboard/workspace/billing/workspace-billing-page.tsx` | `WorkspaceBillingPage` | **Partially Implemented** | Read-only shell |

### Phase B modified pages

| File | Status | Change |
|------|--------|--------|
| `pages/dashboard/billing/billing-overview-page.tsx` | **Partially Implemented** | Additive MRR/ARR KPI row; rest unchanged |

### Phase 1 pages preserved (unchanged registry entries)

| File | Status |
|------|--------|
| `billing-settings-page.tsx` | **Implemented** |
| `billing-audit-log-page.tsx` | **Implemented** |
| `subscription-detail-page.tsx` | **Implemented** |

### Router shells

| File | Status |
|------|--------|
| `pages/subscriptions.tsx` → `BillingLayout` | **Implemented** |
| `pages/workspace.tsx` → `WorkspaceLayout` | **Implemented** |

---

## 3. React Components (Phase B new)

| Component | Path | Status | Notes |
|-----------|------|--------|-------|
| `BillingPlatformFinancialListPage` | `components/billing/platform/billing-platform-financial-list-page.tsx` | **Implemented** | |
| `WorkspaceLayout` | `components/workspace/layout/workspace-layout.tsx` | **Implemented** | |
| `WorkspaceSubNav` | `components/workspace/layout/workspace-sub-nav.tsx` | **Implemented** | |
| `WorkspaceRouteGuard` | `components/workspace/layout/workspace-route-guard.tsx` | **Partially Implemented** | Hardcoded English error strings |

No other Phase B–specific React components exist. Pages compose existing Phase 1 billing UI primitives.

---

## 4. Shared Components Extracted (Phase B)

| Component | Status | Consumed by |
|-----------|--------|-------------|
| `BillingPlatformFinancialListPage` | **Implemented** | Payments, Invoices, Receipts, Failures, Renewals, Expirations |

**Reused without extraction (Phase 1):** `BillingKpiGrid`, `BillingToolbar`, `BillingPagination`, `BillingEmptyState`, `UsageSummaryPanel`, `PlanFeaturesPanel`, `CompanyIdentityHeader`, `SubscriptionStatusBadge`, `BillingLayout`, `BillingSubNav`, `BillingRouteGuard`, and others.

---

## 5. Migrations

| Migration | Purpose | File exists | Applied to DB |
|-----------|---------|-------------|---------------|
| `047_billing_phase_b_foundation.sql` | account_status, workspace permissions, feature flags, event catalog, notification bus, sandbox, provider health, `_v1` RPCs | Yes | **No** |
| `048_billing_phase_b_analytics.sql` | `financial_analytics_snapshots`, compute RPC | Yes | **No** |
| `049_billing_in_app_notification_subscriber.sql` | Bus → `notifications` trigger | Yes | **No** |
| `050_billing_phase_b1_finalization.sql` | `notification_bus_emit_v1`, mutation publisher wiring, global RBAC seeds | Yes | **No** |
| `099_billing_demo_environment.sql` | Enterprise demo seed (§9) | Yes | **No** |

### Objects created by 047 (when applied)

| Object | Status |
|--------|--------|
| `profile_account_status` enum + `profiles` columns | **Implemented** (SQL) |
| `feature_flags` table + seed from `feature_definitions` | **Implemented** (SQL) |
| `billing_event_catalog` + 20 events | **Implemented** (SQL) |
| `billing_notification_events` | **Implemented** (SQL) |
| `payment_provider_health_snapshots` + seed rows | **Implemented** (SQL) |
| `payment_sandbox_mode` definition + `sandbox` provider | **Implemented** (SQL) |
| Permissions: `workspace.view`, `billing.manage_own`, `billing.contact.edit_own`, `billing.payment_method.manage_own`, `billing.documents.download_own` | **Implemented** (SQL) |
| `can_access_workspace()`, `can_manage_own_billing()` | **Implemented** (SQL) |
| Updated `is_feature_enabled()` (override → flag → plan → default) | **Implemented** (SQL) |

### Objects created by 048

| Object | Status |
|--------|--------|
| `financial_analytics_snapshots` | **Implemented** (SQL) |
| `financial_compute_analytics_snapshot_v1()` | **Implemented** (SQL) |

### Objects created by 049

| Object | Status |
|--------|--------|
| `billing_notification_in_app_subscriber()` + trigger on `billing_notification_events` | **Implemented** (SQL) |

### Objects created by 050

| Object | Status |
|--------|--------|
| `notification_bus_emit_v1()` (internal) | **Implemented** (SQL) |
| Refactored `notification_bus_publish_v1()` | **Implemented** (SQL) |
| Updated `renew_subscription_from_payment` with bus emits | **Implemented** (SQL) |
| Updated `assign_subscription_plan` with bus emits | **Implemented** (SQL) |
| Updated `suspend_billing_subscription` with bus emits | **Implemented** (SQL) |
| Updated `restore_billing_subscription` with bus emits | **Implemented** (SQL) |
| Global `role_permissions` inserts for 047 permissions | **Implemented** (SQL) |

### Objects created by 099

| Requirement (architecture §9) | Status |
|----------------------------------|--------|
| `payment_sandbox_mode = true` | **Implemented** |
| Sandbox provider active | **Implemented** |
| Platform Owner auth user + super admin profile | **Implemented** |
| Company Admin personas (Alpha, Beta, Gamma) | **Implemented** |
| Finance Manager persona (Beta) | **Implemented** |
| Employee persona (Beta, read-only) | **Implemented** |
| Demo Alpha — trialing / Basic (Trial tier) | **Implemented** |
| Demo Beta — active / Pro (Professional) | **Implemented** |
| Demo Gamma — active / Enterprise | **Implemented** |
| Demo Delta — expired / Pro | **Implemented** |
| Demo Epsilon — suspended company / Pro subscription | **Implemented** |
| Sample payments (succeeded, failed, pending) | **Implemented** |
| Sample invoices (draft, paid, issued, overdue) | **Implemented** |
| Sample receipts | **Implemented** |
| Sample audit logs | **Implemented** |
| Usage records + company usage snapshots | **Implemented** |
| Entitlements (`plan_features` + Alpha override) | **Implemented** |
| Billing contacts + billing profiles | **Implemented** |
| Sandbox payment method (Beta) | **Implemented** |
| Demo roles + user_roles + role_permissions | **Implemented** |
| Subscription events (activity feed samples) | **Implemented** |
| Analytics snapshot via compute RPC | **Partially Implemented** | May skip if migration auth context blocks RPC |
| Demo coupons | **Deferred** | No coupon schema in any migration |
| Delta/Epsilon dedicated auth admins | **Not Implemented** | Company admin roles seeded; no login users for Delta/Epsilon |

### Demo credentials (after db push)

| Persona | Email | Password |
|---------|-------|----------|
| Platform Owner | `demo-platform@vaultos.local` | `DemoVault2026!` |
| Alpha Admin | `demo-alpha-admin@vaultos.local` | `DemoVault2026!` |
| Beta Admin | `demo-beta-admin@vaultos.local` | `DemoVault2026!` |
| Gamma Admin | `demo-gamma-admin@vaultos.local` | `DemoVault2026!` |
| Finance Manager | `demo-finance@vaultos.local` | `DemoVault2026!` |
| Employee | `demo-employee@vaultos.local` | `DemoVault2026!` |

### Demo entity UUID scheme (fixed, idempotent)

| Entity | UUID prefix pattern |
|--------|---------------------|
| Platform Owner user | `d0000001-0001-4001-8001-000000000001` |
| Persona users | `d0000002-0001-4001-8001-00000000000*` |
| Demo companies | `d0000010-0001-4001-8001-00000000000*` |
| Subscriptions | `d0000020-0001-4001-8001-00000000000*` |
| Demo roles | `d0000030-0001-4001-8001-00000000000*` |

---

## 6. RPCs

Status: **Implemented** = SQL exists and (where applicable) frontend wired. Runtime = requires db push.

### Phase B new `_v1` RPCs

| RPC | Domain | Frontend wired | Publisher emits | DB applied | Status |
|-----|--------|------------------|-----------------|------------|--------|
| `get_workspace_billing_summary_v1` | Workspace | Yes | — | No | **Partially Implemented** |
| `list_billing_payments_paged_v1` | Financial | Yes | — | No | **Partially Implemented** |
| `list_billing_invoices_paged_v1` | Financial | Yes | — | No | **Partially Implemented** |
| `list_billing_receipts_paged_v1` | Financial | Yes | — | No | **Partially Implemented** |
| `list_billing_payment_failures_paged_v1` | Financial | Yes | — | No | **Partially Implemented** |
| `list_upcoming_renewals_paged_v1` | Billing | Yes | — | No | **Partially Implemented** |
| `list_expiring_subscriptions_paged_v1` | Billing | Yes | — | No | **Partially Implemented** |
| `get_billing_revenue_metrics_v1` | Financial | Yes | — | No | **Partially Implemented** |
| `get_payment_provider_health_v1` | Payment | Yes | — | No | **Partially Implemented** |
| `notification_bus_publish_v1` | Notification | Client helper only | — | No | **Partially Implemented** |
| `notification_bus_emit_v1` | Notification | Internal only | — | No | **Implemented** (SQL) |
| `financial_compute_analytics_snapshot_v1` | Financial | No UI caller | — | No | **Partially Implemented** |

### Phase B modified SQL functions

| Function | Change | Status |
|----------|--------|--------|
| `is_feature_enabled()` | Flag layer added (047) | **Implemented** (SQL) |
| `can_access_workspace()` | New (047) | **Implemented** (SQL) |
| `can_manage_own_billing()` | New (047) | **Implemented** (SQL) |
| `renew_subscription_from_payment` | Bus emits added (050) | **Implemented** (SQL) |
| `assign_subscription_plan` | Bus emits added (050) | **Implemented** (SQL) |
| `suspend_billing_subscription` | Bus emits added (050) | **Implemented** (SQL) |
| `restore_billing_subscription` | Bus emits added (050) | **Implemented** (SQL) |

### Phase B trigger function

| Function | Status |
|----------|--------|
| `billing_notification_in_app_subscriber()` (049) | **Implemented** (SQL, not applied) |

### Phase 1 unversioned RPCs (backward compatibility)

| RPC | Compat layer | Modified in B/B.1 | Status |
|-----|--------------|-------------------|--------|
| `list_company_subscriptions_paged` | `list-company-subscriptions-rpc.ts` | No | **Implemented** |
| `list_billing_audit_logs_paged` | `list-billing-audit-rpc.ts` | No | **Implemented** |
| `get_billing_settings_by_category` | Direct | No | **Implemented** |
| `upsert_billing_contact` | Direct | No bus (no catalog event) | **Implemented** |
| `update_billing_settings` | Direct | No bus (no catalog event) | **Implemented** |
| Other Phase 1 billing RPCs | — | No | **Implemented** |

All `_v1` JSONB responses include `schema_version: 1` per architecture §20.

---

## 7. Edge Functions

| Function | Path | Billing-related | Phase B status |
|----------|------|-----------------|----------------|
| `provision-user` | `supabase/functions/provision-user/index.ts` | No | Pre-existing |
| Payment Service `/v1/checkout` | — | Yes | **Not Implemented** (Phase D) |
| Email notification worker | — | Yes | **Not Implemented** (Phase G) |
| Webhook delivery worker | — | Yes | **Not Implemented** (Phase G) |
| Provider health probe job | — | Yes | **Not Implemented** (Phase G) |

**Phase B billing Edge Functions: Not Implemented.**

---

## 8. Permissions

### New in migration 047

| Permission | DB seed (047) | role_permissions (050/099) | Frontend default (`use-rbac.ts`) | Used in UI/SQL | Status |
|------------|---------------|----------------------------|----------------------------------|----------------|--------|
| `workspace.view` | Yes | Yes | Yes | Yes | **Implemented** |
| `billing.manage_own` | Yes | Yes | No | SQL helper only; UI unused | **Partially Implemented** |
| `billing.contact.edit_own` | Yes | Yes | No | **Deferred** (Phase C) | **Partially Implemented** |
| `billing.payment_method.manage_own` | Yes | Yes | No | **Deferred** (Phase D) | **Partially Implemented** |
| `billing.documents.download_own` | Yes | Yes | No | **Deferred** (Phase C) | **Partially Implemented** |

Every 047 permission is assigned to at least one role via migration 050 global patterns and migration 099 demo role seeds.

### Pre-existing permissions used by Phase B

| Permission | Status |
|------------|--------|
| `billing.view` | **Implemented** |
| `billing.view_own` | **Implemented** (041 + demo seeds) |
| `billing.settings.view` | **Implemented** |
| `billing.audit.view` | **Implemented** |
| `subscriptions.view` | **Implemented** (dashboard bootstrap) |
| `is_platform_billing_operator()` (SQL) | **Implemented** |

### Role name patterns receiving 047 permissions (050)

| Role name pattern | Permissions granted |
|-------------------|---------------------|
| `admin`, `company admin`, `company_admin`, `owner` | All six: `workspace.view`, `billing.view_own`, `billing.manage_own`, `billing.contact.edit_own`, `billing.payment_method.manage_own`, `billing.documents.download_own` |
| `finance manager`, `finance_manager` | Same six as Company Admin |
| `employee`, `viewer`, `standard user` | `workspace.view`, `billing.view_own`, `billing.documents.download_own` |
| `platform billing operator`, `billing operator`, `finance` | `workspace.view` only |

---

## 9. RLS Policies (Phase B migrations)

| Table | Policy | Migration | Status |
|-------|--------|-----------|--------|
| `feature_flags` | `feature_flags_select` (authenticated read) | 047 | **Implemented** (SQL) |
| `feature_flags` | `feature_flags_write` (super admin) | 047 | **Implemented** (SQL) |
| `billing_notification_events` | `billing_notification_events_select` | 047 | **Implemented** (SQL) |
| `billing_notification_events` | `billing_notification_events_write` (deny direct) | 047 | **Implemented** (SQL) |
| `payment_provider_health_snapshots` | `payment_provider_health_select` | 047 | **Implemented** (SQL) |
| `financial_analytics_snapshots` | `financial_analytics_snapshots_select` | 048 | **Implemented** (SQL) |
| `financial_analytics_snapshots` | `financial_analytics_snapshots_write` (deny direct) | 048 | **Implemented** (SQL) |
| `billing_event_catalog` | — | — | **Not Implemented** (reference catalog; no RLS) |

Phase 1 RLS on core billing tables is **unchanged**.

---

## 10. Feature Flags

| Item | Status | Notes |
|------|--------|-------|
| `feature_flags` table | **Implemented** (047 SQL) | |
| Seed from active `feature_definitions` | **Implemented** | 6 codes from 042: `core_crm`, `basic_reports`, `advanced_reports`, `ai_assistant`, `whatsapp_channel`, `api_access` |
| `is_feature_enabled()` resolution order | **Implemented** | override → flag → plan → default |
| Platform Admin flag management UI | **Deferred** | Phase G |
| Per-company flag override UI | **Not Implemented** | |

---

## 11. Notification Bus Events

### Catalog (20 events seeded in 047)

| Event code | Domain | Default channels | In-app subscriber (049) | Publisher wired (050) | Status |
|------------|--------|------------------|---------------------------|----------------------|--------|
| `billing.subscription.created` | billing | in_app, webhook | Yes (when applied) | Yes — `renew_subscription_from_payment` (non-active prior status) | **Implemented** |
| `billing.subscription.renewed` | billing | email, in_app, webhook | Yes | Yes — `renew_subscription_from_payment` (prior status active) | **Implemented** |
| `billing.subscription.expired` | billing | email, in_app | Yes | **Not Implemented** — no mutation RPC / job | **Deferred** (Phase G) |
| `billing.subscription.suspended` | billing | email, in_app | Yes | Yes — `suspend_billing_subscription` | **Implemented** |
| `billing.subscription.restored` | billing | in_app | Yes | Yes — `restore_billing_subscription` | **Implemented** |
| `billing.plan.changed` | billing | email, in_app, webhook | Yes | Yes — `assign_subscription_plan` | **Implemented** |
| `billing.cycle.changed` | billing | email, in_app | Yes | Yes — `assign_subscription_plan` (when cycle changes) | **Implemented** |
| `billing.trial.ending` | billing | email, in_app | Yes | **Not Implemented** — no job | **Deferred** (Phase G) |
| `financial.payment.succeeded` | financial | email, in_app, webhook | Yes | Yes — `renew_subscription_from_payment` | **Implemented** |
| `financial.payment.failed` | financial | email, in_app, webhook | Yes | **Not Implemented** — no record-failed-payment RPC | **Deferred** |
| `financial.invoice.generated` | financial | email, in_app | Yes | Yes — `renew_subscription_from_payment` | **Implemented** |
| `financial.invoice.paid` | financial | email, in_app | Yes | **Not Implemented** — paid state set inside renew RPC; separate event not emitted | **Partially Implemented** |
| `financial.receipt.generated` | financial | email, in_app | Yes | Yes — `renew_subscription_from_payment` | **Implemented** |
| `financial.refund.processed` | financial | email, in_app, webhook | Yes | **Not Implemented** | **Deferred** (Phase G) |
| `payment.intent.created` | payment | in_app | Yes | **Not Implemented** | **Deferred** (Phase D) |
| `payment.intent.succeeded` | payment | in_app, webhook | Yes | **Not Implemented** | **Deferred** (Phase D) |
| `payment.intent.failed` | payment | in_app, webhook | Yes | **Not Implemented** | **Deferred** (Phase D) |
| `payment.provider.degraded` | payment | in_app | Yes | **Not Implemented** | **Deferred** (Phase G) |
| `workspace.company.reactivated` | workspace | in_app | Yes | Yes — `restore_billing_subscription` (when company was Suspended) | **Implemented** |
| `workspace.users.reactivated` | workspace | in_app | Yes | **Not Implemented** | **Deferred** (Phase E) |

### Bus infrastructure

| Component | Status |
|-----------|--------|
| `billing_notification_events` table | **Implemented** (SQL, not applied) |
| `notification_bus_emit_v1` | **Implemented** (050) |
| `notification_bus_publish_v1` | **Implemented** (047 + refactored 050) |
| `artifacts/login-app/src/lib/billing/notification-bus.ts` | **Implemented** |
| In-app subscriber trigger (049) | **Implemented** (SQL, not applied) |
| Email channel worker | **Deferred** (Phase G) |
| Webhook channel worker | **Deferred** (Phase G) |

Idempotency keys used on all 050 publisher calls (entity-ID–based).

---

## 12. Analytics Objects

| Object | Migration | Frontend | Status |
|--------|-----------|----------|--------|
| `financial_analytics_snapshots` table | 048 | Not read | **Partially Implemented** |
| `financial_compute_analytics_snapshot_v1()` | 048 | Not called from UI | **Partially Implemented** |
| `get_billing_revenue_metrics_v1()` (live) | 047 | Overview, Revenue, Analytics pages | **Partially Implemented** (needs db push) |
| MRR / ARR KPI display | Frontend | **Implemented** |
| ARPU (client-computed on analytics page) | Frontend | **Implemented** |
| LTV, logo churn, renewal rate, collection rate | — | Display "—" | **Deferred** |
| Scheduled snapshot job | — | — | **Deferred** (Phase G) |
| `dimensions jsonb` segmentation | 048 column | Unused | **Not Implemented** |
| Demo seed analytics snapshot | 099 | — | **Partially Implemented** |

---

## 13. Provider Health Components

| Item | Status | Notes |
|------|--------|-------|
| `payment_provider_health_snapshots` table | **Implemented** (047 SQL) | Seed rows on apply |
| `get_payment_provider_health_v1` RPC | **Implemented** (047 SQL) | |
| `BillingProviderHealthPage` | **Partially Implemented** | Inline page; no sub-components |
| `usePaymentProviderHealth` hook | **Implemented** | |
| Dedicated `ProviderHealth*` extracted components | **Not Implemented** | |
| Live health probe / scheduled job | **Deferred** | Phase G |
| Provider degraded bus event publish | **Not Implemented** | |

---

## 14. Workspace Components

| Component / module | Status | Notes |
|--------------------|--------|-------|
| `WorkspaceLayout` | **Implemented** | |
| `WorkspaceSubNav` | **Implemented** | |
| `WorkspaceRouteGuard` | **Partially Implemented** | i18n gap on errors |
| `workspace-route-registry.ts` | **Implemented** | |
| `workspace-permissions.ts` | **Implemented** | |
| `workspace-billing-summary.ts` | **Implemented** | |
| `use-workspace-billing-summary.ts` | **Implemented** | Query key includes `v1` |
| Workspace Members / Security / Settings | **Not Implemented** | Phase C+ |
| Workspace billing self-service (renew, pay, download) | **Not Implemented** | Phase D–E |
| Reused billing panels in workspace pages | **Implemented** | |

---

## 15. Known Limitations

1. **Database not applied** — Migrations 047–050 and 099 exist as SQL files only. No `_v1` RPCs, bus, flags, or demo data exist in a live database until `supabase db push`.
2. **Platform list pages fail at runtime** until 047 is applied (RPCs missing in DB).
3. **Demo seed incomplete vs §9.4** — Coupons not seeded (no schema). Delta/Epsilon have no dedicated login users.
4. **Analytics snapshot RPC in 099** — May be skipped during migration if auth context does not satisfy `financial_compute_analytics_snapshot_v1` permission check; wrapped in exception handler.
5. **Notification bus partial catalog coverage** — Only mutation RPCs with catalog events publish (050). Twelve catalog events have no publisher yet (see §11).
6. **`financial.invoice.paid` not emitted separately** — Invoice marked paid inside `renew_subscription_from_payment`; only `financial.invoice.generated` is emitted.
7. **Email/webhook channels** — Events with mixed channels remain `pending` after in-app delivery until Phase G workers.
8. **Analytics UI** — Does not read `financial_analytics_snapshots`; uses live compute RPC.
9. **Provider health is seed/static** — No probes; non-manual/sandbox providers show `unknown` unless seeded.
10. **Workspace billing is read-only** — No renewal wizard, payment methods UI, or document downloads.
11. **`canManageOwnBilling()` unused in frontend** — Permission exists but no UI enforcement path.
12. **Renewals/expirations search** — Toolbar rendered but RPCs ignore search for those list types.
13. **Sandbox toggle UI** — `payment_sandbox_mode` setting exists in DB seed; no billing settings UI control.
14. **Workspace route guard** — Hardcoded English error messages.
15. **Runtime backward compatibility unverified** — Code review only; Phase 1 flows not exercised against DB after B.1 SQL.
16. **E2E scenarios §9.6** — Scenarios 2–4 require Phase D–E UI (wizard, downloads). Scenario 1 and 6–7 have data support after seed; not executed.

---

## 16. Deferred Work

### Phase C+

| Item | Phase |
|------|-------|
| Platform: companies, plans, reports pages | C+ |
| Workspace document center + downloads | C |
| Workspace members shell | C |
| UI naming completion (Customer vs Subscription Invoices in all surfaces) | C |
| `billing.contact.edit_own` UI | C |

### Phase D–E

| Item | Phase |
|------|-------|
| Payment providers admin UI | D |
| Payment methods UI | D |
| Payment intent RPCs + Edge Payment Service | D |
| Renewal wizard (7-step) | E |
| `financial.apply_payment_success()` orchestrator | E |
| `workspace.users.reactivated` bus publish | E |

### Phase G+

| Item | Phase |
|------|-------|
| Refunds platform page | G |
| Email outbox + worker | G |
| Webhook deliveries | G |
| Provider health probes | G |
| Expiration / trial-ending jobs + bus publishes | G |
| Feature flag admin UI | G |
| Coupon schema + seed | E/G |
| PDF generation | G |

### Explicitly blocked (registry redirect)

`/subscriptions/companies`, `/plans`, `/list`, `/reports`, `/refunds`, `/providers`

---

## 17. Build Verification

| Check | Command / artifact | Result | Status |
|-------|-------------------|--------|--------|
| Production build | `npm run build` in `artifacts/login-app` | Exit code 0 | **Implemented** |
| TypeScript compilation | Vite build | No errors | **Implemented** |
| Lazy route chunks | Build output | Separate chunks for workspace + platform list pages | **Implemented** |
| i18n EN | `locales/en/common.json` | `workspace.*`, `billing.platform.*`, `billing.nav.*` | **Implemented** |
| i18n AR | `locales/ar/common.json` | Mirrored keys | **Implemented** |
| ESLint / dedicated lint pass | — | Not run in this verification | **Not verified** |
| SQL migration apply | `supabase db push` | Not run | **Not verified** |
| SQL syntax / migration dry-run | — | Not run | **Not verified** |

Build warnings (non-blocking): bundle size > 500 kB; dynamic/static import overlap in `platform-financial-list.ts`.

---

## 18. Backward Compatibility Verification

| Guarantee | Verification method | Status |
|-----------|---------------------|--------|
| Phase 1 platform routes preserved | Registry + layout review | **Implemented** |
| Phase 1 RPCs not dropped | Migration grep — no DROP on core RPCs | **Implemented** |
| RPC compat layers intact | `list-company-subscriptions-rpc.ts`, `list-billing-audit-rpc.ts` unchanged | **Implemented** |
| Additive migrations only | 047–050, 099 use IF NOT EXISTS / ON CONFLICT / new `_v1` suffix | **Implemented** |
| `is_feature_enabled()` extended not duplicated | Single function replaced in 047 | **Implemented** |
| Blocked paths still redirect | `BLOCKED_BILLING_PATHS` in `billing-layout.tsx` | **Implemented** |
| Existing `notifications` table reused | 049 subscriber inserts into existing table | **Implemented** |
| Notification bell / realtime unchanged | `use-notifications.ts` not modified | **Implemented** |
| Dashboard subscriptions entry unchanged | `pages/subscriptions.tsx` → `BillingLayout` | **Implemented** |
| Unversioned RPC naming preserved | New work uses `_v1`; Phase 1 hooks unchanged | **Implemented** |
| Mutation RPC signatures unchanged | 050 CREATE OR REPLACE same signatures | **Implemented** |
| Runtime Phase 1 regression test | E2E / manual | **Not verified** (blocked on db push) |

---

## Final Approval Checklist

Use this checklist to authorize database deployment. Do not check an item unless verified after your review.

### Architecture & documentation

- [ ] [`enterprise-billing-platform-v2.md`](./enterprise-billing-platform-v2.md) v2.1 remains approved
- [ ] [`enterprise-billing-impact-analysis-v2.md`](./enterprise-billing-impact-analysis-v2.md) reviewed
- [ ] This Phase B.1 report reviewed in full (not summary-only)

### Phase B.1 blocking fixes (source code)

- [ ] Migration `099` demo seed scope acceptable (coupons deferred; Delta/Epsilon admin logins absent)
- [ ] Notification bus publisher wiring on mutation RPCs acceptable (partial catalog coverage documented in §11)
- [ ] RBAC `role_permissions` for all 047 permissions acceptable (050 global patterns + 099 demo roles)
- [ ] Migration `050` acceptable (internal emit + RPC replacements)

### Migrations ready to apply (order)

- [ ] `047_billing_phase_b_foundation.sql`
- [ ] `048_billing_phase_b_analytics.sql`
- [ ] `049_billing_in_app_notification_subscriber.sql`
- [ ] `050_billing_phase_b1_finalization.sql`
- [ ] `099_billing_demo_environment.sql`

### Known limitations accepted for deployment

- [ ] Partial catalog event publisher coverage accepted until Phase D–G
- [ ] Analytics UI live-compute vs snapshots accepted for Phase B
- [ ] Provider health seed-only accepted until Phase G probes
- [ ] Workspace read-only billing accepted until Phase D–E
- [ ] Demo coupon absence accepted

### Post-deployment gates (not part of db push approval)

- [ ] `supabase db push` executed successfully
- [ ] Demo personas can authenticate with documented credentials
- [ ] Platform Owner sees MRR on analytics/overview
- [ ] Company Admin sees workspace billing summary
- [ ] Failed payment visible on failures dashboard (Demo Beta seed)
- [ ] Phase 1 billing flows regression pass
- [ ] Enterprise E2E §9.6 scenarios executed and recorded

---

## Authorization Record

| Action | Authorized | Date | Approver |
|--------|------------|------|----------|
| Review of this report | ☐ | | |
| `supabase db push` (047–050, 099) | ☐ | | |
| Enterprise E2E verification | ☐ | | |

---

*End of Phase B.1 Verification Report (Complete).*
