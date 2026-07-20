# Backlog: Restore Demo Seed RBAC Data

**Status:** Open  
**Priority:** Medium  
**Track:** Demo environment (separate from Enterprise RBAC)  
**Created:** 2026-07-19  

## Summary

Demo companies (`company_type = demo`) are **intentionally excluded** from migration 123/124 tenant DEFAULT provisioning. Their RBAC catalog comes from demo seed migrations (099/100/102).

Remote verification found **all five demo companies have zero roles and zero `user_roles` assignments**. Demo personas such as `demo-beta-admin@vaultos.local` therefore return `roles = 0` in isolation probes — this is **demo data drift**, not an Enterprise RBAC regression.

## Scope

- Restore demo-specific roles per company (e.g. Demo Beta Admin, Finance Manager, Employee).
- Restore `user_roles` assignments for demo personas.
- Re-apply demo role permission bundles from seed migrations.
- **Do not** change production tenant provisioning (123/124) or production RLS (126).

## Out of scope

- Applying `provision_tenant_default_roles()` to demo companies.
- Merging demo companies into the enterprise DEFAULT role catalog.
- Mixing this repair with Al Rahma / production tenant RBAC work.

## Suggested approach

1. Run idempotent repair based on `100_billing_demo_seed_repair.sql` / `102_enterprise_demo_seed.sql` role + `user_roles` sections only.
2. Verify demo personas regain `roles.view` / `users.view` via assigned roles.
3. Re-run `scripts/tenant-isolation-probe.mts` for demo-beta-admin — expect tenant-local demo roles only (not cross-tenant leak).

## Acceptance criteria

- Each demo company has its seeded role catalog restored.
- Demo admin personas have role assignments matching seed intent.
- Demo companies remain excluded from enterprise tenant provisioning lifecycle.
- Production tenant isolation (126) unchanged.
