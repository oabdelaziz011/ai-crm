# Schema Drift Report — 2026-07-18

**Project:** `lfbtnskmvibikalsxwsm` (linked Supabase)  
**Method:** Live catalog queries via `supabase db query --linked`, compared against repository migrations `001`–`108`  
**Migration history:** All repository migrations through `108` were already recorded as applied on remote before this audit.

## Executive summary

Production schema drift was **confirmed and isolated to `public.companies`**. All other sampled catalog objects (indexes, triggers, RLS policies, foreign keys on `companies`; full column metadata on `company_subscriptions` and `plans`) matched the repository.

The critical failure mode was a **column default mismatch**:

| Column | Live (before) | Repository (003/032) |
|--------|---------------|----------------------|
| `subscription_status` | default `'Active'` | default `'trialing'` |

Because `'Active'` is not in the `companies_subscription_status_check` allowed set, **company creation failed** whenever the application omitted `subscription_status` and the database applied the default.

Root cause class: **post-migration manual schema edit** (likely Supabase Dashboard), not missing migration files.

---

## Comparison methodology

1. `supabase migration list --linked` — confirmed migrations `001`–`108` applied.
2. Live catalog queries for `public.companies`:
   - column defaults, nullability, types
   - `pg_constraint` / `pg_get_constraintdef`
   - `pg_indexes`
   - `information_schema.triggers`
   - `pg_policies`
   - row-level data distribution
3. Spot checks on `company_subscriptions`, `plans`, and RLS flags across all `public` tables.
4. Reusable validator: `scripts/schema-drift-validation.sql`

---

## Drift detail: `public.companies`

### Column defaults

| Column | Live (before) | Expected (repo) | Drift |
|--------|---------------|-------------------|-------|
| `status` | `'active'` | `'Trial'` | **YES** |
| `subscription_plan` | `'Starter'` | `'Basic'` | **YES** |
| `subscription_status` | `'Active'` | `'trialing'` | **YES** (critical) |
| `billing_cycle` | `'monthly'` | `'monthly'` | no |
| `created_at` | `now()` | `now()` | no |
| `updated_at` | `now()` | `now()` | no |

### Nullability

| Column | Live (before) | Expected | Drift |
|--------|---------------|----------|-------|
| `status` | NULL allowed | NOT NULL | **YES** |
| `subscription_status` | NULL allowed | NOT NULL | **YES** |
| `billing_cycle` | NULL allowed | NOT NULL | **YES** |
| `created_at` | NULL allowed | NOT NULL | **YES** |
| `updated_at` | NULL allowed | NOT NULL | **YES** |
| `name`, `subscription_plan` | NOT NULL | NOT NULL | no |

### CHECK constraints

| Constraint | Live (before) | Expected (003 + 032) | Drift |
|------------|---------------|----------------------|-------|
| `companies_subscription_status_check` | present (6 billing values incl. `grace_period`) | present | no |
| `companies_status_check` | **missing** | `status IN ('Active','Suspended','Trial')` | **YES** |
| `companies_billing_cycle_check` | **missing** | `billing_cycle IN ('monthly','yearly')` | **YES** |

Live constraint definition (unchanged, correct per 032):

```sql
CHECK (subscription_status = ANY (ARRAY[
  'active', 'trialing', 'past_due', 'grace_period', 'canceled', 'expired'
]))
```

### Foreign keys

| Constraint | Live (before) | Expected (005) | Drift |
|------------|---------------|----------------|-------|
| `companies_plan_id_fkey` | present | present | no |
| `companies_pkey` | present | present | no |

### Indexes

All expected indexes were present before reconciliation:

- `idx_companies_status`
- `idx_companies_subscription_status`
- `idx_companies_billing_cycle`
- `idx_companies_subscription_expires_at`
- `idx_companies_plan_id`

### Triggers

| Trigger | Timing | Live (before) | Expected | Drift |
|---------|--------|---------------|----------|-------|
| `companies_updated_at` | BEFORE UPDATE | present | present | no |
| `trg_audit_companies` | AFTER I/U/D | present | present | no |
| `trg_notify_subscription_events` | AFTER I/U | present | present | no |

Neither INSERT trigger modifies `subscription_status`.

### RLS policies

RLS enabled on `companies`. All five policies from migration `003` were present:

- `companies_super_admin_select`
- `companies_super_admin_insert`
- `companies_super_admin_update`
- `companies_super_admin_delete`
- `companies_member_select`

### Functions touching `subscription_status`

Functions referencing `subscription_status` exist but are **not** attached as INSERT triggers on `companies`:

- `sync_company_subscription_denormalized` (UPDATE via billing RPC)
- `restore_billing_subscription`, `suspend_billing_subscription`
- `seed_enterprise_demo_v1`

### Data anomalies (before reconciliation)

| Issue | Count | Example |
|-------|-------|---------|
| Invalid `status` casing | 1 row | `status = 'active'` (lowercase) |
| Valid `subscription_status` values | 7/7 rows | no invalid billing statuses in existing data |
| Non-repo plan label | 1 row | `subscription_plan = 'Starter'` (allowed — no CHECK on plan name) |

### Reproduction (before fix)

```sql
INSERT INTO public.companies (name, status, subscription_plan)
VALUES ('Constraint Test', 'Trial', 'Basic');
```

**Failed** with:

```
ERROR 23514: violates check constraint "companies_subscription_status_check"
DETAIL: ... subscription_status = Active  (from column default)
```

---

## Broader schema scan

| Area | Result |
|------|--------|
| Migrations applied | `001`–`108` all remote ✅ |
| `company_subscriptions` columns | Match repo (defaults, NOT NULL) ✅ |
| `plans` columns | Match repo ✅ |
| RLS disabled tables | `billing_event_catalog`, `conversation_number_sequences`, `demo_environment_manifest` — **also no RLS in repo migrations** ✅ |
| Other `public` tables | No additional drift detected in this audit scope |

---

## Reconciliation action

Formal migration created (not manual SQL):

**`supabase/migrations/109_companies_schema_reconciliation.sql`**

Reconciliation scope:

1. Normalize existing `companies` row data
2. Restore column defaults and NOT NULL constraints
3. Add missing CHECK constraints (`status`, `billing_cycle`; reaffirm `subscription_status`)
4. Idempotent re-assert indexes, FK, triggers, RLS policies

Validation script for repeat audits:

**`scripts/schema-drift-validation.sql`**
