# provision-user Tenant Isolation — Security Sprint Report

**Date:** 2026-07-18  
**Status:** Code complete — deploy edge function to activate live E2E

---

## 1. Root Cause Summary

The `provision-user` Edge Function validated global `users.edit` via RPC, then used the **service role** to write `profiles.company_id` and `user_roles` using **client-supplied `companyId` and `roleId` without server-side tenant checks**.

Because the service role bypasses RLS, a company admin with `users.edit` could theoretically:

- Provision users into **another company** by passing a foreign `companyId`
- Assign **roles from another tenant** by passing a foreign `roleId`
- Operate on **existing users outside their company** (email collision path)

This is a **manual tenant boundary** failure, not an RBAC model or permission-code issue.

---

## 2. Files Modified

| File | Change |
|---|---|
| `supabase/functions/provision-user/index.ts` | Server-derived company, validation gate, audit on reject, explicit `is_super_admin: false` on create |
| `supabase/functions/provision-user/validation.ts` | **New** — pure tenant validation logic |
| `supabase/functions/provision-user/audit.ts` | **New** — rejection audit writer |
| `scripts/provision-user-security.test.mts` | **New** — 12 unit tests |
| `scripts/provision-user-security-e2e.mts` | **New** — 7 live E2E scenarios |
| `scripts/rbac-static-regression.test.mts` | Asserts tenant validation wiring |

**Not changed:** permission codes, RLS policies, RBAC schema, frontend RBAC hooks.

---

## 3. Security Controls Implemented

### Requirement 1 — Never trust client `companyId`

- Caller profile loaded from DB (`profiles.company_id`, `is_super_admin`)
- Non–super-admins: `effectiveCompanyId = caller.company_id` (client value is hint only)
- Mismatch → `403 Forbidden` + audit

### Requirement 2 — Role ownership

- Role loaded from DB; `role.company_id` must equal `effectiveCompanyId`
- Cross-tenant role → `403` + audit (`role_tenant_mismatch`)

### Requirement 3 — Target user ownership

- Existing profile loaded before invite
- If `existing.company_id !== effectiveCompanyId` → `403` + audit
- If target is super admin and caller is not → `403` + audit

### Requirement 4 — `companyId` as hint only

- Validated against caller company for non–super-admins
- Super admin must supply `companyId` (required for platform owner with null company)

### Requirement 5 — Privilege escalation prevention

- `is_super_admin` never set true by provision path (forced `false` on create)
- Cross-tenant roles blocked
- Platform roles (`company_id IS NULL`) blocked for all callers
- Same-company **system roles** still assignable by company admins (**RBAC unchanged**, matches existing `user_roles` RLS)

### Requirement 6 — Audit logging

Rejected requests write to `audit_logs`:

- `action`: `CREATE`
- `entity`: `provision_user_rejection`
- `metadata`: caller/requested company & role IDs, reason code, timestamp

API response is always generic: `{ "error": "Forbidden" }` — no internal reason leaked.

---

## 4. Security Validation Results

### Unit tests — **12/12 PASS**

```bash
npx tsx scripts/provision-user-security.test.mts
```

| Test | Result |
|---|---|
| valid same-company role | PASS |
| company admin same-company system role | PASS |
| role from another company | PASS |
| fake companyId | PASS |
| cross-tenant system role attempt | PASS |
| target user from another company | PASS |
| missing users.edit | PASS |
| super admin valid path | PASS |
| super admin role/company mismatch | PASS |
| non-super-admin vs super admin target | PASS |
| client companyId ignored (uses caller) | PASS |
| platform role forbidden | PASS |

### Static regression — **PASS**

```bash
npx tsx scripts/rbac-static-regression.test.mts
```

### Live E2E — **Requires deploy**

```bash
supabase functions deploy provision-user --linked
npx tsx scripts/provision-user-security-e2e.mts
```

Pre-deploy live run confirmed only `missing users.edit` (already enforced). Tenant checks activate after deploy.

---

## 5. Evidence: No Cross-Tenant Assignment

After deploy, for company admin (Beta):

| Attack vector | Server behavior |
|---|---|
| `companyId` = Gamma | `403` before service-role writes |
| `roleId` = Gamma Admin role | `403` — role tenant mismatch |
| `companyId` = Gamma + Beta system role | `403` — company mismatch |
| Existing Gamma user email | `403` — target tenant mismatch |
| Employee caller | `403` — missing `users.edit` |

Successful paths:

- Beta admin + Beta company + Beta Employee role → `200`
- Platform owner + Gamma company + Gamma Admin role → `200`

All writes use **`effectiveCompanyId` from validation**, not raw client input.

---

## 6. RBAC Behavior Unchanged

| Area | Impact |
|---|---|
| Permission codes | None |
| RLS policies | None modified |
| `user_has_permission()` | Still used for `users.edit` gate only |
| Company admin assigning same-company system roles | Still allowed (matches RLS) |
| Super admin cross-company provisioning | Explicitly allowed |
| Frontend `useCreateManagedUser` | No API contract change; still sends `companyId` as hint |

---

## Deploy Checklist

1. `supabase functions deploy provision-user --linked`
2. `npx tsx scripts/provision-user-security.test.mts` (expect 12/12)
3. `npx tsx scripts/provision-user-security-e2e.mts` (expect 7/7)
4. `npx tsx scripts/rbac-e2e-validation.mts` (regression — expect 52/52)
