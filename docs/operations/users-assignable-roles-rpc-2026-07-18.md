# Users Page Assignable Roles RPC

**Date:** 2026-07-18  
**Migration:** `121_get_assignable_roles_rpc.sql`

## Root Cause

Users page queried `public.roles` directly; `roles_select_policy` requires `roles.view`.  
`users.edit`-only admins received zero rows.

## Solution

`public.get_assignable_roles(p_company_id uuid)` — SECURITY DEFINER RPC authorized by `users.edit`, tenant-scoped, returns `id`, `name`, `is_system` only.

## Modified Files

| File | Change |
|------|--------|
| `supabase/migrations/121_get_assignable_roles_rpc.sql` | RPC |
| `artifacts/login-app/src/lib/users/fetch-assignable-roles.ts` | RPC client |
| `artifacts/login-app/src/hooks/use-company-assignable-roles.ts` | Uses RPC |
| `artifacts/login-app/src/lib/users/role-company-validation.ts` | Validation via RPC |
| `scripts/get-assignable-roles-probe.mts` | Validation |

## Apply & Validate

```bash
supabase db push --linked
npx tsx scripts/get-assignable-roles-probe.mts
npx tsx scripts/user-role-company-validation.test.mts
```

## Regression Checklist

- [ ] Company admin (`users.edit` only) — Edit User dropdown populated
- [ ] Company admin — foreign tenant RPC returns `Cross tenant access denied`
- [ ] Super admin — assignable roles for any company
- [ ] Roles page — still requires `roles.view` (unchanged)
- [ ] No `roles.view` granted to company admins
- [ ] `roles_select_policy` unchanged
