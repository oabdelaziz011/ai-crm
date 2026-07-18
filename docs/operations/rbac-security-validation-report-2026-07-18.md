# RBAC Security Validation Report — Migration 116

**Date:** 2026-07-18  
**Status:** Pre-apply security review — **APPROVED with conditions**  
**Scope:** `116_rbac_permissions_select_fix.sql`, `auth-context.tsx`, `use-rbac.ts`, `use-users-management.ts`

---

## Executive Summary

Migration **116** fixes the production RBAC bootstrap bug **without weakening RLS**. It is **more restrictive** than the original migration 004 policy (which allowed all authenticated users to read the full permissions catalog) and **more precise** than the broken migration 113 policy (which required `roles.view` even to read one's own assigned permissions).

| Requirement | Verdict |
|---|---|
| No full catalog for ordinary users | **PASS** (live + policy analysis) |
| Assigned-only reads via role/direct grants | **PASS** (policy + AuthContext) |
| Full catalog only with `roles.view` / super admin | **PASS** |
| AuthContext merges role + direct grants | **PASS** (code) |
| No duplicate codes after merge | **PASS** (Set dedupe by ID) |
| `refreshAuthContext` scoped to current user | **PASS** (code review) |
| Live UI alignment (Employee/Support) | **BLOCKED** until migration 116 applied |

**Recommendation:** Apply migration 116. Re-run `scripts/rbac-security-validation.mts` after apply; Employee/Support checks should flip from FAIL → PASS.

**Separate finding (not introduced by 116):** `provision-user` edge function lacks tenant-scoped authorization — see §7.

---

## 1. Migration 116 Policy Analysis

### Policy (proposed)

```sql
create policy permissions_select_policy on public.permissions for select using (
  auth.role() = 'authenticated'
  and (
    public.is_super_admin()
    or public.user_has_permission('roles.view')
    or exists (select 1 from user_roles ur join role_permissions rp ... where ur.user_id = auth.uid() and rp.permission_id = permissions.id)
    or exists (select 1 from user_permissions up where up.user_id = auth.uid() and up.permission_id = permissions.id)
  )
);
```

### Comparison matrix

| Policy version | Ordinary user (no `roles.view`) | User with `roles.view` | Super admin |
|---|---|---|---|
| **004** (original) | Full catalog ❌ | Full catalog | Full catalog |
| **113** (broken) | **Nothing** (bootstrap broken) | Full catalog | Full catalog |
| **116** (proposed) | **Assigned rows only** ✅ | Full catalog ✅ | Full catalog ✅ |

### Why this cannot leak the catalog

1. **Row-level enforcement:** PostgreSQL evaluates `USING` per row. Unfiltered `SELECT * FROM permissions` returns only rows passing one of the OR branches.
2. **Self-scoped EXISTS:** Role and direct-grant branches bind to `auth.uid()` — users cannot read permission metadata for grants held by others.
3. **`user_has_permission('roles.view')` is not a SELECT bypass:** The function is `SECURITY DEFINER` and returns a boolean; it does not expose rows to the client.
4. **Knowing a permission ID is insufficient:** An attacker who learns `permission_id` values from `role_permissions` (company-visible per existing RLS) still cannot read that row from `permissions` unless the ID is in **their own** effective grant set.
5. **No broader than required:** Does **not** restore migration 004's `auth.role() = 'authenticated'` blanket read.

---

## 2. AuthContext Permission Loading

**File:** `artifacts/login-app/src/context/auth-context.tsx`

| Step | Source | RLS on source table |
|---|---|---|
| 1 | `user_roles` → `role_ids` | Own rows + company admin visibility |
| 2 | `role_permissions` → `permission_id` | Company-scoped role definitions |
| 3 | `user_permissions` → `permission_id` | Own rows (+ admin for company users) |
| 4 | `permissions` `.in("id", ids)` | Migration 116 row filter |

**Merge & dedupe:** IDs collected in `Set<string>` before the `permissions` query — role + direct grants deduplicated by primary key. One row per ID → no duplicate codes in normal operation.

**JWT:** No permission claims. Session stores auth tokens only; permissions live in React state loaded at login/refresh.

---

## 3. `refreshAuthContext()` Trigger Audit

| Call site | Condition | Cross-user risk |
|---|---|---|
| `useUpdateManagedUser` | `variables.roleId && user?.id === variables.id` | None |
| `useAssignUserRoles` | `user?.id === variables.userId` | None |
| `useUpdateRole` | Updated role is in caller's own `roles` list | None |
| `profile-personal-form` | Profile field save (display metadata) | None — reloads own session only |
| `refreshAuthContext()` impl | Always uses `session?.user?.id` | None |

**Expected staleness (by design):** When admin A changes user B's role, user B must logout/login (or receive a future realtime refresh). Admin A's context is not refreshed — correct.

---

## 4. Live Validation Results (pre-migration 116)

Script: `scripts/rbac-security-validation.mts`  
RLS/API script: `scripts/rbac-e2e-validation.mts` (52/52 PASS)

### Catalog leak tests

| Persona | Assigned IDs | Visible permission rows | `roles.delete` probe | Catalog leak? |
|---|---|---|---|---|
| Employee | 5 | 0 (113 broken) / **5 expected post-116** | Blocked ✅ | No ✅ |
| Support | 8 | 0 / **8 expected** | Blocked ✅ | No ✅ |
| Company Admin | 44 | 105 (full catalog via `roles.view`) | N/A (admin) | Intended ✅ |
| Super Admin | 0 | 105 (via `is_super_admin()`) | N/A | Intended ✅ |

### AuthContext / frontend alignment

| Persona | Loaded codes | RPC match | Sidebar (simulated) |
|---|---|---|---|
| Employee | 0 ❌ → 5 post-116 | `customers.view` RPC true, frontend false ❌ | Empty ❌ → customers, bookings post-116 |
| Support | 0 ❌ → 8 post-116 | `customers.view`, `ai_chat.view` mismatch ❌ | Empty ❌ → customers, ai-chat post-116 |
| Company Admin | 44 ✅ | All sampled codes match ✅ | 17 routes ✅ |
| Super Admin | 0 (no roles; uses `isSuperAdmin` bypass) ✅ | All true via bypass ✅ | 19 routes ✅ |

### Duplicate codes

All personas: **none** (Set dedupe by permission ID).

---

## 5. Layer-by-Layer Enforcement

| Layer | Source | Employee (post-116) | Support (post-116) | Company Admin | Super Admin |
|---|---|---|---|---|---|
| **Sidebar** | `hasPermission` → AuthContext | Permitted routes only | Permitted routes only | Full admin nav | All routes |
| **Route guards** | `DashboardSectionRoute` → same | Deny unpermissioned pages | Deny unpermissioned pages | Allow per role | Allow all |
| **Buttons** | Page-level `hasPermission` (e.g. `canManageUsers`) | Hide create/edit without `users.edit` | Same pattern | Shown per grant | All shown |
| **API (PostgREST)** | RLS + `user_has_permission()` | Enforced server-side ✅ | Enforced ✅ | Enforced ✅ | Bypass ✅ |
| **Edge Functions** | RPC checks (e.g. `provision-user`) | 403 without `users.edit` ✅ | Same ✅ | Allowed with grant ✅ | Allowed ✅ |
| **RLS** | Per-table policies | E2E verified ✅ | E2E verified ✅ | E2E verified ✅ | E2E verified ✅ |

**Important:** Server enforcement (RLS/RPC/Edge Functions) already works. Only the **frontend bootstrap** is broken pre-116.

---

## 6. Post-Apply Validation Checklist

```bash
# 1. Apply migration
supabase db push --linked
# or run 116_rbac_permissions_select_fix.sql in SQL Editor

# 2. Security + bootstrap validation
npx tsx scripts/rbac-security-validation.mts

# 3. RLS/API regression
npx tsx scripts/rbac-e2e-validation.mts
```

**Expected after apply:**
- Employee: 7 failing checks → 0 failures; `visible=5`, sidebar includes customers/bookings
- Support: 5 failures → 0; `visible=8`, sidebar includes customers/ai-chat
- Company Admin / Super Admin: unchanged (already passing)
- No persona should see `visible` ≫ `assigned` unless they have `roles.view` or super admin

---

## 7. Separate Security Finding (Out of Scope for 116)

**High — Cross-tenant user provisioning**

`useCreateManagedUser` → `provision-user` edge function validates global `users.edit` only, then uses service role with caller-supplied `companyId` / `roleId` without tenant validation.

**Impact:** Company admin could provision users into another company or assign arbitrary roles.

**Remediation (recommended before production user invites):**
- Enforce `companyId === current_company_id()` for non–super-admins
- Validate `roleId` belongs to that company
- Keep service-role writes only after scoped authorization

This predates migration 116 but is on the user-management code path reviewed in this sprint.

---

## 8. Approval

| Reviewer action | Decision |
|---|---|
| Migration 116 RLS policy | **APPROVE** — meets least-privilege requirements |
| AuthContext changes | **APPROVE** — correct merge, no extra DB access |
| refreshAuthContext wiring | **APPROVE** — correctly scoped |
| Apply to production | **APPROVE** after running post-apply validation |
| provision-user tenant checks | **FIX separately** — do not block 116 |

---

*Generated by live diagnostic scripts against linked Supabase project.*
