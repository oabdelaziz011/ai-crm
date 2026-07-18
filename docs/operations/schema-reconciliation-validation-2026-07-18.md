# Schema Reconciliation Validation Report — 2026-07-18

**Project:** `lfbtnskmvibikalsxwsm`  
**Migration applied:** `109_companies_schema_reconciliation.sql` via `supabase db push --linked`  
**Validator:** `scripts/schema-drift-validation.sql`

---

## Migration application

```
Applying migration 109_companies_schema_reconciliation.sql...
Finished supabase db push.
```

Remote migration table now includes `109` (local and remote in sync).

---

## Automated validation (`scripts/schema-drift-validation.sql`)

### Before migration

Failed checks (representative):

| check_id | live | expected |
|----------|------|----------|
| `default.status` | `'active'::text` | `'Trial'::text` |
| `default.subscription_plan` | `'Starter'::text` | `'Basic'::text` |
| `default.subscription_status` | `'Active'::text` | `'trialing'::text` |
| `nullable.status` | NULL | NOT NULL |
| `nullable.subscription_status` | NULL | NOT NULL |
| `nullable.billing_cycle` | NULL | NOT NULL |
| `nullable.created_at` | NULL | NOT NULL |
| `nullable.updated_at` | NULL | NOT NULL |
| `missing.constraint.companies_status_check` | `<missing>` | CHECK on `status` |
| `missing.constraint.companies_billing_cycle_check` | `<missing>` | CHECK on `billing_cycle` |
| `data.status.invalid` | `active` | `Active\|Suspended\|Trial` |

### After migration

```json
{ "rows": [] }
```

**All automated checks passed** (empty result set = no drift detected).

---

## Manual verification

### Defaults + nullability

| Column | Default (live) | NOT NULL |
|--------|----------------|----------|
| `status` | `'Trial'` | ✅ |
| `subscription_plan` | `'Basic'` | ✅ |
| `subscription_status` | `'trialing'` | ✅ |
| `billing_cycle` | `'monthly'` | ✅ |
| `created_at` | `now()` | ✅ |
| `updated_at` | `now()` | ✅ |

### CHECK constraints

All three present:

```sql
companies_status_check
  CHECK (status = ANY (ARRAY['Active','Suspended','Trial']))

companies_billing_cycle_check
  CHECK (billing_cycle = ANY (ARRAY['monthly','yearly']))

companies_subscription_status_check
  CHECK (subscription_status = ANY (ARRAY[
    'active','trialing','past_due','grace_period','canceled','expired'
  ]))
```

### Foreign keys

- `companies_plan_id_fkey` → `plans(id)` ✅

### Indexes

All five `idx_companies_*` indexes present ✅

### Triggers

- `companies_updated_at` (BEFORE UPDATE) ✅
- `trg_audit_companies` (AFTER INSERT/UPDATE/DELETE) ✅
- `trg_notify_subscription_events` (AFTER INSERT/UPDATE) ✅

### RLS policies

All five `companies_*` policies present; RLS enabled ✅

### Data normalization

| Before | After |
|--------|-------|
| 1 row with `status = 'active'` | 0 — normalized to `'Active'` |

Existing billing statuses remained valid (`active`, `trialing`, `expired`).

---

## Insert regression test

```sql
INSERT INTO public.companies (name, status, subscription_plan)
VALUES ('Constraint Test Reconcile', 'Trial', 'Basic')
RETURNING id, status, subscription_status, billing_cycle;
```

**Result: SUCCESS**

```json
{
  "id": "41cbb88a-6abe-4975-b278-23814a5ce603",
  "status": "Trial",
  "subscription_status": "trialing",
  "billing_cycle": "monthly"
}
```

This confirms the original production failure mode is resolved: omitted `subscription_status` now defaults to `'trialing'`, which satisfies the CHECK constraint.

Test row from validation insert may remain (`name = 'Constraint Test Reconcile'`). Remove manually if desired:

```sql
DELETE FROM public.companies WHERE name = 'Constraint Test Reconcile';
```

---

## Conclusion

| Verification area | Status |
|-------------------|--------|
| Defaults | ✅ Reconciled |
| Nullability | ✅ Reconciled |
| CHECK constraints | ✅ Reconciled |
| Foreign keys | ✅ Unchanged (already correct) |
| Indexes | ✅ Unchanged (already correct) |
| Triggers | ✅ Re-asserted |
| RLS policies | ✅ Re-asserted |
| Functions | ✅ No drift; no changes required |
| Company create insert | ✅ Passes |

**Production `public.companies` is reconciled to repository migration state (003 + 032 + related objects).**

Repeat validation anytime:

```bash
supabase db query --linked -f scripts/schema-drift-validation.sql
```
