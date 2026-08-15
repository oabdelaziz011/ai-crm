# Commercial Packages (Phase 7.2–7.6)

## Trial → Paid conversion (Phase 7.6)

**Phase 7.6 provides administrative subscription activation. It does not implement payment confirmation.**

```
Trialing + approved company
  → package (fixed list price) + billing cycle
  → convert_trial_to_paid_v1
  → expire source=trial grants
  → assign_company_package_v1 (snapshot + source=package grants)
  → status=active + paid period dates
  → audit trial_converted_to_paid
  → Phase 6 resolver
```

| Rule | Behavior |
|------|----------|
| Approval | `approval_status` must be `approved` |
| Eligible status | `trialing` only (`active` same package+cycle = idempotent skip) |
| Package | Active `plans` row with `pricing_mode=fixed` and positive cycle price |
| Free / custom | **Rejected** (not paid conversions) |
| Trial grants | Deactivated (`is_active=false`) before package provision |
| Manual / contract / system | Preserved |
| `trial_ends_at` | Retained historically; ignored while `status=active` |
| Suspended company | Conversion allowed; `companies.status` stays `Suspended` |
| Payment | **Not implemented** — conversion source metadata may be `admin`/`payment`/… for future |

RPC: `convert_trial_to_paid_v1(company_id, plan_id, billing_cycle, reason, conversion_source)`.

## Package upgrade / downgrade (Phase 7.7)

**Phase 7.7 provides administrative package change with grant synchronization. It does not implement payment, proration, or checkout.**

```
active|past_due|grace_period + package A
  → change_company_package_v1(target package B)
  → compare previous package_feature_snapshot vs plan_features(B)
  → revoke source=package features not in B
  → provision source=package features in B
  → freeze new package_feature_snapshot
  → preserve status, billing_cycle, period dates
  → audit package_upgraded | package_downgraded | package_changed
  → Phase 6 resolver
```

| Rule | Behavior |
|------|----------|
| Eligible status | `active`, `past_due`, `grace_period` |
| Trialing | **Rejected** — use `convert_trial_to_paid_v1` (not a package switch) |
| Expired / canceled | Rejected |
| Same package | Idempotent `{ skipped: true, reason: already_on_target_package }` |
| Billing cycle | **Preserved** (this RPC does not switch cycle) |
| Period dates / status | Preserved |
| Package grants only | Add/remove `source=package` only |
| Manual / contract / system | Preserved |
| Trial grants | Untouched by this RPC (trialing blocked) |
| Suspended company | Package may change; `companies.status` stays `Suspended` |
| Direction | Prefer `plans.tier_rank`; else net feature delta → upgrade/downgrade/change |
| Payment | **Not collected** |

Low-level assigner `assign_company_package_v1` remains for initial assign / Trial→Paid provisioning. Prefer `change_company_package_v1` for admin upgrade/downgrade UX.

RPC: `change_company_package_v1(company_id, plan_id, reason)`.

## Subscription expiration / renewal / grace (Phase 7.8)

**Phase 7.8 makes existing lifecycle RPCs operationally enforceable. It does not implement payment providers or fabricate renewals.**

```
Scheduler / worker / CLI / internal API
  → run_subscription_lifecycle_enforcement_v1(limit)
      → enforce_trial_expirations_v1          (trialing + trial_ends_at <= now → grace)
      → enforce_active_period_due_v1         (active + period end due → past_due)
      → enforce_past_due_to_grace_v1         (past_due + still unpaid → grace)
      → enforce_grace_period_expirations_v1  (grace ended → expired)
  → Phase 6 resolver
```

| Concern | Behavior |
|---------|----------|
| Commercial during `past_due` / `grace_period` | **Still entitled if grants valid** (Phase 6 preserved) |
| Commercial when `expired` | Trial grants ineffective / deactivated; package/manual/contract/system **preserved** |
| Paid renewal | **Only** via authoritative `renew_subscription_from_payment` (amount required) |
| `auto_renewal` alone | Does **not** create payment success |
| Suspended company | Lifecycle may advance; `companies.status` stays `Suspended` |
| Approval | Pending/rejected still deny commercial access |
| Batch | Bounded (`limit` ≤ 500), idempotent, `SKIP LOCKED` |

Worker entrypoints (opt-in):

- CLI: `node scripts/run-subscription-lifecycle-enforcement.mjs`
- API: `POST /api/internal/billing/lifecycle-enforce` (`INTERNAL_API_KEY`)
- api-server interval when `BILLING_LIFECYCLE_WORKER_ENABLED=true`

## Subscription lifecycle (Phase 7.5)

**`company_subscriptions` represents lifecycle state; it does not replace the Phase 6 commercial entitlement resolver.**

| Concern | Authority |
|---------|-----------|
| Subscription lifecycle status | `company_subscriptions.status` |
| Company operational status | `companies.status` (`Active` / `Suspended` / `Trial`) |
| Approval | `companies.approval_status` |
| Package relationship | `company_subscriptions.plan_id` → `plans.id` |
| Plan name display mirror | `companies.subscription_plan` (not authorization) |
| Billing cycle | `company_subscriptions.billing_cycle` (`monthly` \| `yearly`) |
| Runtime commercial access | Phase 6 overrides + `is_feature_enabled` |

### Supported statuses

`trialing` · `active` · `past_due` · `grace_period` · `expired` · `canceled`

Legal transitions are enforced by `assert_subscription_status_transition` (trigger on status updates).

Notable behaviors (existing product semantics preserved):

- `past_due` / `grace_period`: still commercially entitled **if grants are valid** (Phase 6)
- `expired` / trial-ended / canceled-after-period: commercially expired via `is_company_commercially_expired`
- Administrative **Suspend** sets `companies.status = Suspended` and is **preserved across sync** until `restore_billing_subscription`
- **Cancel** (`cancel_company_subscription_v1`): lifecycle only — does not delete tenant data or mass-revoke grants

### Admin RPCs (hardened)

| RPC | Role |
|-----|------|
| `assign_company_package_v1` / `assign_subscription_plan` | Package + snapshot + package grants |
| `change_company_package_v1` | Admin upgrade/downgrade (preserves lifecycle; Phase 7.7) |
| `run_subscription_lifecycle_enforcement_v1` | Batch trial/period/grace enforcement (Phase 7.8) |
| `enforce_trial_expirations_v1` | Trial due → grace |
| `enforce_active_period_due_v1` | Active period due → past_due |
| `enforce_past_due_to_grace_v1` | Past due unpaid → grace |
| `enforce_grace_period_expirations_v1` | Grace ended → expired |
| `extend_company_trial_v1` | Extend trial dates + trial-source grant expiry |
| `mark_subscription_past_due_v1` | Lifecycle → past_due |
| `record_subscription_renewal_failure_v1` | → grace_period |
| `enforce_grace_period_expirations_v1` | grace → expired |
| `cancel_company_subscription_v1` | → canceled |
| `suspend_billing_subscription` / `restore_billing_subscription` | Company Suspended ops |
| `verify_subscription_lifecycle_integrity_v1` | Report-only consistency check |

### Limitations (later phases)

No checkout, gateway webhooks, dunning workers, prorations, or self-serve upgrade billing.

## Decision

**Evolve `public.plans` as the SaaS package carrier.**

Reasons:

- `company_subscriptions.plan_id` already references `plans`
- Monthly/yearly pricing already lives on `plans`
- `plan_features` already maps plan → `feature_definitions.code`
- A parallel `packages` table would duplicate subscription linkage without benefit

## Responsibility matrix (Phase 7.3)

| Object | Responsibility | Runtime access authority? |
|--------|----------------|---------------------------|
| `feature_definitions` | Master product feature catalog (what exists) | Catalog only; classification feeds resolver |
| `plans` | Sellable commercial package catalog + list prices | **No** |
| `plan_features` | Package contents / packaging metadata (+ optional limits) | **No — MUST NOT authorize runtime access** |
| `company_subscriptions` | Subscription lifecycle (one row per company); `plan_id` → `plans.id` | Lifecycle only |
| `package_feature_snapshot` | Historical package feature codes frozen at assignment | Historical packaging only |
| `company_feature_overrides` | What the company actually has right now (`source` = trial/manual/contract/system/package) | **Yes** (commercial SoT) |
| Phase 6 resolver (`is_feature_enabled` / `require_company_feature_v1`) | Effective commercial access | **Yes** |
| `feature_flags` / kill-switches | Operational enable/disable | Kill-switch only — **not** subscription |
| RBAC | Who may act | Authorization — **not** commercial entitlement |
| LicensingEngine / `platform_company_licenses` / `platform_plan_entitlements` | Legacy quotas + **unmapped** platform keys only | Must **not** authorize Phase 6 mapped commercial codes |

```
feature_definitions
  + company_feature_overrides
  + approval / suspension
  + feature flags
  + RBAC
  → commercial entitlement resolver
  → is_feature_enabled / require_company_feature_v1
  → runtime access
```

Packages/plans are commercial packaging metadata. They provision grants on assign; they never authorize by themselves.

**plan_features MUST NOT be used as runtime authorization.**

**Phase 6 commercial entitlement authority was NOT replaced.**

## PACKAGE ≠ ENTITLEMENT

```
Package (plans + plan_features)
  → assign_company_package_v1
  → freeze package_feature_snapshot
  → set grants source=package
  → company_feature_overrides
  → is_feature_enabled / require_company_feature_v1
  → UI/API with RBAC + kill-switch
```

## Stock package matrix (DB-driven)

Canonical view: `commercial_package_feature_matrix_v1`.

Stock packages (Phase 7.2/7.3 — do not invent alternate product strategy in UI):

| Package | Included feature codes |
|---------|------------------------|
| Basic | `core_crm`, `customers`, `ticketing`, `basic_reports`, `bookings` |
| Pro | Basic + `leads`, `opportunities`, `ai_assistant`, `whatsapp_channel` |
| Enterprise | Pro + `operations`, `ai_employee`, `email_channel`, `omnichannel`, `workflow_automation`, `advanced_reports`, `api_access` |

Integrity RPC: `verify_commercial_package_mapping_integrity_v1()`.

## Pricing model (Phase 7.4)

**Phase 7.4 does not implement payment collection.**

| Concern | Authority |
|---------|-----------|
| Current package **list** prices | `plans.price_monthly`, `plans.price_yearly`, `plans.pricing_mode` |
| Billing cycle | `company_subscriptions.billing_cycle` (`monthly` \| `yearly`) |
| Currency | Billing settings `default_currency` (platform/company) — **not** stored on `plans` |
| Runtime feature access | Phase 6 overrides + resolver — **never** pricing |
| Actual charged / negotiated amount | **Not modeled yet** (future subscription billing phase) |

### Semantics

- `price_monthly` = monthly **list** price (amount **per month**)
- `price_yearly` = annual **list** price (**total per year**, typically discounted vs 12× monthly — **not** “$/month with annual billing”)
- `pricing_mode`:
  - `free` — both prices must be `0`
  - `fixed` — at least one list price `> 0`
  - `custom` — contact/negotiated; prices optional display hints (zero ≠ “free”)

Derived annual savings = `(price_monthly × 12) − price_yearly` (UI only; not stored).

### Price change safety

Changing catalog list prices:

- does **not** mutate `package_feature_snapshot`
- does **not** mutate `company_feature_overrides`
- does **not** alter subscription period fields
- writes `package_price_updated` (+ `package_updated`) audit events

Pricing alone never provisions or revokes entitlements.

### Future extension points (not implemented)

- Company-specific negotiated / grandfathered prices on the subscription row
- Quotes, coupons, prorations, gateways (Stripe/Paymob/Fawry)

## Pricing semantics (catalog)

| Column | Meaning |
|--------|---------|
| `plans.pricing_mode` | `free` \| `fixed` \| `custom` |
| `plans.price_monthly` | Monthly list price |
| `plans.price_yearly` | Annual total list price |
| Currency | `default_currency` billing setting |

Integrity RPC: `verify_commercial_package_pricing_integrity_v1()`.


## `companies.subscription_plan`

Denormalized display mirror synced via `sync_company_subscription_denormalized`. Canonical relationship: `company_subscriptions.plan_id` → `plans.id`. Never use `subscription_plan` for authorization.

## Grant source `package`

Package change revokes only package-derived features while preserving:

- `manual`
- `contract`
- `system`
- `trial`

## Snapshot / catalog edit safety

Editing package features updates the catalog only (`set_commercial_package_features_v1`).

Existing companies keep `package_feature_snapshot` and package grants until deliberate reassignment.

Deactivating a package:

- stops new assignment (`assign_company_package_v1` requires `is_active`)
- may hide from public catalog (`is_public` / inactive)
- does **not** revoke existing snapshots or grants

## Assignment / change semantics

`assign_company_package_v1(company_id, plan_id, billing_cycle)`:

1. Resolve active package
2. Resolve package features from `plan_features` (+ active catalog)
3. Freeze `package_feature_snapshot`
4. Create/update `source=package` grants
5. Revoke only package grants no longer in the new snapshot
6. Preserve manual / contract / system / trial
7. Sync denormalized company subscription fields
8. Write `billing_audit_logs` (`package_assigned` / `package_changed`)

`assign_subscription_plan` wraps this RPC (compat).

## Core vs commercial

- Core (`core_crm`, `customers`): non-billable, no subscription required, remain free under Phase 6
- Commercial catalog: `default_enabled = false`, `is_billable = true`, `requires_subscription = true`

Packages may list core features for marketing; core access is not paywalled by packaging.

## Trial

Trial provisioning remains Phase 4/5 (`source=trial`, `trial_feature_set`). Packages do not replace trial.

## Authorization

Package catalog create/edit/assign: `_can_manage_commercial_packages()` = super-admin OR `can_edit_billing()`.

Company admins cannot modify the package catalog.

## LicensingEngine (remaining legitimate uses)

- Quotas via `getQuota`
- Unmapped platform keys (e.g. knowledge / embeddings / tool.calling) not in `feature-code-map` / `BILLING_FEATURE_CODES`
- Must never override `is_feature_enabled` for mapped commercial codes (`ai.chat` → `ai_assistant`, etc.)

## Feature flags

Kill-switches only. Correct runtime: **RBAC AND commercial entitlement AND feature flag** where applicable. Feature flag ≠ subscription.

## Out of scope (later Phase 7.x)

Checkout, payment providers, coupons, prorations, dunning, refunds, webhooks, pricing engine.
