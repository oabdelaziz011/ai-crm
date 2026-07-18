# Migration 123 + 124 — Deployment Readiness (Post-Hardening)

**Date:** 2026-07-19  
**Migrations:** `123_enterprise_tenant_provisioning.sql`, `124_provisioning_security_hardening.sql`

---

## Executive Verdict

| # | Requirement | Verdict | Blocker? |
|---|---|---|---|
| 1 | Provisioning RPC security | **PASS** | No |
| 2 | Last active Company Admin enforced | **PASS** | No |
| 3 | `role_permissions` uses `role_type` | **PASS** | No |
| 4 | Duplicate admin audit / safe resolve | **PASS** (flag + promote) | No |
| 5 | Retry/repair idempotency | **PASS** | No |
| 6 | `user_roles` preserved | **PASS** | No |
| 7 | Migration bootstrap | **PASS** | No |

**Recommendation:** **GO** for staging deploy (`123` then `124`), then run readiness probe, then production with snapshot.

---

## Priority 1 — Provisioning RPC Security

### Implementation

- `assert_trusted_provisioning_caller()` allows only:
  - `auth.role() = 'service_role'`
  - `vault.provisioning_bootstrap = true` (migration-only)
  - `is_super_admin() = true`
- Applied at start of:
  - `provision_tenant_default_roles`
  - `execute_tenant_provisioning`
  - `provision_company_default_roles`
  - `retry_tenant_provisioning`
  - `repair_companies_missing_roles`
  - `audit_tenant_duplicate_admin_roles`
- **Revoked** `EXECUTE` on internal provisioning functions from `PUBLIC` / `authenticated`
- **Granted** `EXECUTE` to `service_role` only for internal provisioning entrypoints
- Public super-admin RPCs remain on `authenticated`: `create_company_v1`, `retry_tenant_provisioning`, `repair_companies_missing_roles`

### Evidence

See `124_provisioning_security_hardening.sql` sections P1.

---

## Priority 2 — Last Company Administrator

### Implementation

- `count_active_company_admin_assignees(company_id)` — active profiles with `DEFAULT` role `template_key = 'admin'`
- `assert_tenant_retains_active_company_admin(company_id)` — raises if tenant has active users but zero active company admins
- **Deferred constraint trigger** on `user_roles` (INSERT/UPDATE/DELETE) — validates at transaction end (safe for delete+insert role changes)
- **BEFORE UPDATE** trigger on `profiles` for `is_active` / `company_id` changes
- Skips `platform` / `demo` companies and super-admin profiles
- Allows **zero admins when zero active users** (provisioned tenant, no users yet)

---

## Priority 3 — `role_permissions` RLS Consistency

### Implementation

`role_permissions_insert_policy` and `role_permissions_delete_policy` now require `r.role_type = 'CUSTOM'` for tenant admins (mirrors `roles_update_policy`).

Super admin bypass unchanged — can edit DEFAULT role permissions intentionally.

---

## Priority 4 — Duplicate Admin Semantics

### Implementation

- Table: `tenant_admin_role_audit`
- Function: `audit_tenant_duplicate_admin_roles()`
- **Safe auto-resolve:** single legacy `Admin`/`Company Admin` CUSTOM role with no DEFAULT template → promoted to `DEFAULT template_key = admin`
- **Flag only:** both DEFAULT `Company Admin` and legacy `Admin` CUSTOM roles → `duplicate_admin_semantics` (no deletes, no user moves)

Query flagged tenants:

```sql
SELECT c.name, a.issue_code, a.details, a.resolved_at
FROM tenant_admin_role_audit a
JOIN companies c ON c.id = a.company_id
WHERE a.issue_code = 'duplicate_admin_semantics'
  AND a.resolved_at IS NULL;
```

---

## Idempotency & Non-Destructive Repair

Unchanged from 123 audit — reinforced in 124:

- Template-key lookup + unique index `(company_id, template_key)`
- Repair inserts missing roles / updates metadata only
- No `user_roles` writes in migrations
- Legacy role promotion reuses existing role IDs when possible

---

## Migration Apply Order

1. `123_enterprise_tenant_provisioning.sql` — schema + functions (no bootstrap repair)
2. `124_provisioning_security_hardening.sql` — security + triggers + bootstrap DO block

---

## Pre-Production Checklist

- [ ] DB snapshot
- [ ] `supabase db push --linked` (staging first)
- [ ] `tsx scripts/migration-123-124-readiness-probe.mts`
- [ ] `tsx scripts/company-create-flow.test.mts`
- [ ] Review `tenant_admin_role_audit` for flagged tenants
- [ ] Verify Companies create + retry as platform super admin
- [ ] Verify tenant user cannot call `execute_tenant_provisioning` (forbidden)
- [ ] Verify demoting last admin raises DB error

---

## Rollback

If **124 fails mid-apply:** transaction rolls back; 123 state remains.

If **124 applied, need revert:**

1. Drop triggers: `user_roles_enforce_company_admin`, `profiles_enforce_company_admin`
2. Restore `role_permissions` policies from `113_rbac_rls_completion.sql`
3. Re-grant provisioning RPCs per 119 (only if intentionally reverting architecture)
4. Drop `tenant_admin_role_audit` if desired
5. Re-run integrity queries for orphan/cross-tenant `user_roles`

---

## Known Operational Notes

1. **First active user** on a tenant must hold Company Admin if other active users exist; otherwise assignment/deactivation is blocked.
2. **Flagged duplicate admin tenants** require manual review — audit preserves both roles and all assignments.
3. **Platform operators** use `is_super_admin` profile flag; PLATFORM role row is catalog separation, not cross-tenant assignment.
