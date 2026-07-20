# Enterprise RBAC Milestone Validation

**Date:** 2026-07-19  
**Result:** **14/14 PASS — Milestone COMPLETE**  
**Script:** `scripts/enterprise-rbac-milestone-validation.mts`  
**Demo companies:** Excluded from this validation

---

## Tenants used

| Tenant | Purpose |
|---|---|
| **عيادة الرحمة (Al Rahma)** `cecad301-…` | Structural verification of DEFAULT role catalog + provisioning lifecycle |
| **RBAC Milestone 2026-07-19T00:19:15Z** `13a3002e-…` | Live Company Admin JWT E2E (create/edit/delete/protection tests) |
| **VaultOS** (platform) | Super Admin cross-tenant visibility checks |

Live Company Admin session was bootstrapped on a **new real tenant** (`company_type = tenant`) because the Al Rahma admin (`omar.abdelaziz.mokhtar22@gmail.com`) credentials were not available in the validation environment. Al Rahma was still used for production tenant structural proof (test 1).

---

## Results

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Company has DEFAULT roles | **PASS** | Al Rahma: `Company Admin`, `Manager`, `Employee` (`role_type=DEFAULT`, templates admin/manager/employee). `tenant_provisioning_status=completed`. |
| 2 | Company Admin sees only tenant roles | **PASS** | Live tenant: 3 roles visible, 0 foreign, 0 platform-global. |
| 3 | Company Admin sees only tenant users | **PASS** | Live tenant: 1 profile visible (self + tenant scope), 0 foreign. |
| 4 | Company Admin can create CUSTOM role | **PASS** | Created `Milestone Custom …`, `role_type=CUSTOM`. |
| 5 | Company Admin can edit CUSTOM role permissions | **PASS** | Granted `customers.view` on custom role via `role_permissions`. |
| 6 | Company Admin cannot delete DEFAULT roles | **PASS** | DELETE returned no error but role remained (RLS blocked); Company Admin role still present after attempt. |
| 7 | Company Admin cannot remove last Company Admin | **PASS** | `replace_user_role` → `Tenant must retain at least one active Company Administrator`. |
| 8 | Platform Super Admin manages tenants without breaking isolation | **PASS** | Super admin sees 27 roles / 17 profiles across multiple companies; Al Rahma (3) and VaultOS (5) visible; tenant admin isolation unchanged (126 RLS). |

---

## Al Rahma company record

| Field | Value |
|---|---|
| `tenant_provisioning_status` | `completed` |
| `provisioning_error` | `null` |
| `provisioning_attempt_count` | `1` |
| `provisioned_at` | `2026-07-18 23:22:50.771166+00` |

---

## Milestone declaration

**Enterprise RBAC milestone is COMPLETE** for production tenants:

- Migrations **123/124/125/126** deployed
- Tenant provisioning + DEFAULT role catalog operational on real tenants
- Tenant isolation enforced at RLS (no frontend filtering dependency)
- Atomic role replacement (`replace_user_role`) + last Company Admin protection verified live

---

## Separate backlog (not part of this milestone)

See [backlog-restore-demo-seed-rbac-data.md](./backlog-restore-demo-seed-rbac-data.md) — demo seed RBAC restoration tracked independently.

---

## Re-run

```bash
# Requires SUPABASE_SERVICE_ROLE_KEY in environment
npx tsx scripts/enterprise-rbac-milestone-validation.mts
```
