# Sprint 6.2 — AI Agents RBAC Validation Matrix

**Date:** 2026-07-31  
**Scope:** Sprint 6.1 (`ai_agents` feature flag) + Sprint 6.2 (RBAC) + Sprint 6.2.1 (`agents.manage`) + Sprint 6.2.2 (UI permission tests)  
**Branch baseline:** `main` (commits through Sprint 6.2.x work)  
**Validation status:** **CONDITIONAL PASS** — core permission model is consistent across runtime, helpers, and RLS for implemented operations; I-1 (RLS feature-flag gap) closed in Sprint 6.2.4; remaining gaps documented below.

---

## 1. Permission model summary

| Code | Purpose | Seeded roles (default) | Runtime guard | RLS |
|------|---------|------------------------|---------------|-----|
| `agents.view` | Read workflows, events, checkpoints | Admin template + admin-like company roles + **`runtime.execute` backfill** | `assertAgentsReadAccess` | `SELECT` on agent tables |
| `agents.execute` | Start, resume, cancel workflows | Admin template + admin-like roles + **`runtime.execute` backfill** | `assertAgentsExecuteAccess` | `INSERT` / `UPDATE` on workflows; `INSERT` on events/checkpoints |
| `agents.manage` | Admin workflow delete; future config/policies | Admin template + admin-like roles only (**not** in `runtime.execute` backfill) | `assertAgentsManageAccess` | `DELETE` on `agent_workflows` |
| `ai_agents` (feature) | Tenant product toggle | Per-company `platform_ai_feature_flags` row | `assertAgentsFeatureEnabled` / provider helpers | `company_has_agents_access()` → `platform_ai_feature_enabled(..., 'ai_agents')` |
| Super-admin | Platform bypass | N/A | All guards short-circuit when `isSuperAdmin` | Bypass via `company_has_permission()` + `platform_ai_feature_enabled()` |

**Source files reviewed:**

- `supabase/migrations/196_agents_rbac_sprint6_2.sql`
- `supabase/migrations/197_agents_manage_rls_sprint6_2_1.sql`
- `supabase/migrations/198_agents_feature_rls_sprint6_2_4.sql`
- `supabase/migrations/113_rbac_rls_completion.sql` (`company_has_permission`)
- `lib/agent-runtime/src/utils/agents-guards.ts`
- `lib/agent-runtime/src/executor/agent-execution-engine.ts`
- `lib/platform-ai-provider/src/agents-feature-access.ts`
- `artifacts/login-app/src/lib/platform-ai/agents-access.ts`
- `artifacts/login-app/src/lib/platform-ai/agent-ui-gating.ts`
- `artifacts/login-app/src/components/floating-ai/floating-ai-panel-content.tsx`
- `artifacts/login-app/src/components/floating-ai/agent-workflow-panel.tsx`
- `artifacts/login-app/src/locales/en/permission-catalog.json`

---

## 2. Architecture diagram (authorization flow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         User session (AuthContext)                       │
│   roles → permissions[]   isSuperAdmin   companyId                      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
┌──────────────────┐   ┌──────────────────────┐   ┌─────────────────────┐
│ Login-app UI     │   │ @workspace/          │   │ Supabase RLS        │
│ agents-access    │   │ agent-runtime        │   │ company_has_agents_ │
│ agent-ui-gating  │   │ agents-guards        │   │ access()            │
│                  │   │ AgentExecutionEngine │   │ = permission AND    │
│ + ai_agents      │   │                      │   │ ai_agents feature   │
│   feature hook   │   │ read  → view+feature │   │ agents.view  → SELECT│
│                  │   │ exec  → execute+feat │   │ agents.execute→ INS/UPD│
│ Super-admin:     │   │ manage→ manage+feat  │   │ agents.manage → DELETE│
│ BYPASS feature   │   │ Super-admin: BYPASS  │   │ super-admin BYPASS   │
└──────────────────┘   └──────────────────────┘   └─────────────────────┘
          │                         │                         │
          └─────────────────────────┴─────────────────────────┘
                          Must align for defense-in-depth
```

**Policy formula (non–super-admin, feature ON):**

```
Effective access = hasPermission(code) AND isFeatureEnabled(ai_agents) AND tenant match
Super-admin      = BYPASS permission + feature checks (app/runtime); RLS bypass via is_super_admin()
```

---

## 3. Actor definitions

Assumes **`ai_agents` feature ON** unless noted. Permission sets reflect migrations + template defaults.

| Actor | Typical permissions | Notes |
|-------|---------------------|-------|
| **Super Admin** | Platform role; app bypass | Uses `platform_ai_ops_agent_workflows()` for cross-tenant ops |
| **Company Admin** | `agents.view`, `agents.execute`, `agents.manage` | Seeded via admin template (`196`) |
| **Runtime Execute role** | `agents.view`, `agents.execute` (via `runtime.execute` backfill) | Does **not** receive `agents.manage` |
| **Manager** | `ai_chat.view`, `ai_chat.use` (default template) | **No** agent permissions in `119_company_role_provisioning.sql` |
| **Employee** | `ai_chat.view` (default template) | **No** agent permissions |
| **Custom — view only** | `agents.view` | Observer |
| **Custom — view + execute** | `agents.view`, `agents.execute` | Operator |
| **Custom — full manage** | `agents.view`, `agents.execute`, `agents.manage` | Administrator |

---

## 4. RBAC validation matrix (`ai_agents` ON)

Legend:

| Symbol | Meaning |
|--------|---------|
| **ALLOW** | Operation permitted via normal RBAC + feature flag |
| **DENY** | Operation blocked by permissions and/or feature flag |
| **BYPASS** | Super-admin skips app-layer permission/feature checks |
| **N/A** | Operation not exposed in UI and/or not implemented |

### 4.1 UI & read operations

| Operation | Super Admin | Co. Admin | Runtime Execute | Manager | Employee | View only | View + Exec | Full manage |
|-----------|-------------|-----------|-----------------|---------|----------|-----------|-------------|-------------|
| **View Agent tab** | BYPASS | ALLOW | ALLOW | DENY | DENY | ALLOW | ALLOW | ALLOW |
| **View workflow** (single) | BYPASS | ALLOW | ALLOW | DENY | DENY | ALLOW | ALLOW | ALLOW |
| **List workflows** (tenant) | BYPASS | ALLOW | ALLOW | DENY | DENY | ALLOW | ALLOW | ALLOW |
| **View events** | BYPASS | ALLOW | ALLOW | DENY | DENY | ALLOW | ALLOW | ALLOW |
| **View checkpoints** | BYPASS | ALLOW | ALLOW | DENY | DENY | ALLOW | ALLOW | ALLOW |

### 4.2 Execute operations

| Operation | Super Admin | Co. Admin | Runtime Execute | Manager | Employee | View only | View + Exec | Full manage |
|-----------|-------------|-----------|-----------------|---------|----------|-----------|-------------|-------------|
| **Start workflow** | BYPASS | ALLOW | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW |
| **Resume workflow** | BYPASS | ALLOW | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW |
| **Cancel workflow** | BYPASS | ALLOW | ALLOW | DENY | DENY | DENY | ALLOW | ALLOW |

### 4.3 Manage & reserved operations

| Operation | Super Admin | Co. Admin | Runtime Execute | Manager | Employee | View only | View + Exec | Full manage |
|-----------|-------------|-----------|-----------------|---------|----------|-----------|-------------|-------------|
| **Delete workflow** | BYPASS | ALLOW | DENY | DENY | DENY | DENY | DENY | ALLOW |
| **Future manage ops** (config/policies) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

### 4.4 UI exposure notes (same matrix, UI column)

| Operation | UI status |
|-----------|-----------|
| View Agent tab | **Exposed** — `floating-ai-panel-content.tsx` |
| View workflow / history tabs | **Exposed** — `agent-workflow-panel.tsx` |
| Start / Resume | **Exposed** — composer + resume button |
| Cancel | **N/A (all roles)** — runtime supports; **no cancel button** in UI |
| List workflows | **N/A (all roles)** — engine method exists; **no UI consumer** |
| Delete workflow | **N/A (all roles)** — engine + RLS exist; **no UI consumer** |
| Future manage | **N/A** — helpers seeded; no config CRUD |

---

## 5. Layer alignment matrix (implemented operations)

Validates runtime guards vs RLS vs login-app helpers when **`ai_agents` ON** and actor has required codes.

| Operation | Runtime guard | Provider / login-app helper | RLS policy | Aligned? |
|-----------|---------------|----------------------------|------------|----------|
| View Agent tab | — | `shouldShowAgentsNavigation` → `agents.view` + feature | — | ✅ |
| View workflow | `assertAgentsReadAccess` | `canViewAgentHistory` | `SELECT` → `agents.view` + `ai_agents` | ✅ |
| List workflows | `assertAgentsReadAccess` | *(no dedicated UI helper)* | `SELECT` → `agents.view` + `ai_agents` | ✅ |
| View events | `assertAgentsReadAccess` | via `canView` in panel | `SELECT` → `agents.view` + `ai_agents` | ✅ |
| View checkpoints | `assertAgentsReadAccess` | via `canView` in panel | `SELECT` → `agents.view` + `ai_agents` | ✅ |
| Start | `assertAgentsExecuteAccess` | `canStartAgentWorkflow` | `INSERT` → `agents.execute` + `ai_agents` | ✅ |
| Resume | `assertAgentsExecuteAccess` | `canResumeAgentWorkflow` | `UPDATE` → `agents.execute` + `ai_agents` | ✅ |
| Cancel | `assertAgentsExecuteAccess` | *(no UI gate)* | `UPDATE` → `agents.execute` + `ai_agents` | ⚠️ UI gap |
| Delete | `assertAgentsManageAccess` | `canManageAgentWorkflows` *(unused in UI)* | `DELETE` → `agents.manage` + `ai_agents` | ⚠️ UI gap |
| Future manage | *(not implemented)* | `canManageAgents` | *(no tables)* | N/A |

---

## 6. Feature flag matrix (`ai_agents`)

| Actor | Feature OFF | Feature ON | Feature row missing (`undefined`) |
|-------|-------------|------------|-----------------------------------|
| **Non–super-admin with `agents.view`** | **DENY** (UI + runtime + RLS) | ALLOW (if permission held) | **ALLOW** (existing-tenant semantics) |
| **Super Admin** | **BYPASS** (UI + runtime + RLS) | BYPASS | BYPASS |
| **RLS (all actors with `agents.view`)** | **DENY** direct SELECT | ALLOW | ALLOW |

> **Sprint 6.2.4:** RLS now uses `company_has_agents_access()` which requires both RBAC permission and `platform_ai_feature_enabled(..., 'ai_agents')`, matching runtime guards.

---

## 7. Validation checklist

### 7.1 Database & RBAC seeding

| Check | Status | Evidence |
|-------|--------|----------|
| Permissions `agents.view/execute/manage` exist | ✅ Pass | `196_agents_rbac_sprint6_2.sql` |
| Admin template receives all three | ✅ Pass | `196` platform_role_template_permissions |
| `runtime.execute` backfill → view + execute | ✅ Pass | `196` role_permissions insert |
| RLS read policies use `agents.view` | ✅ Pass | `196` |
| RLS write policies use `agents.execute` | ✅ Pass | `196` |
| RLS delete policy uses `agents.manage` | ✅ Pass | `197_agents_manage_rls_sprint6_2_1.sql` |
| Super-admin RLS bypass | ✅ Pass | `company_has_agents_access()` via underlying helpers |
| RLS enforces `ai_agents` feature flag | ✅ Pass | `198_agents_feature_rls_sprint6_2_4.sql` |

### 7.2 Runtime (`@workspace/agent-runtime`)

| Check | Status | Evidence |
|-------|--------|----------|
| Read paths guarded by view + feature | ✅ Pass | `getWorkflow`, `listWorkflows`, `listEvents`, `loadLatestCheckpoint` |
| Execute paths guarded by execute + feature | ✅ Pass | `start`, `resume`, `cancel` |
| Manage path guarded by manage + feature | ✅ Pass | `deleteWorkflow` |
| Super-admin bypass in guards | ✅ Pass | `agents-guards.ts` |
| Unit tests for view/execute/manage | ✅ Pass | `agents-guards.test.ts`, `agent-execution-engine.test.ts` |

### 7.3 Provider & login-app helpers

| Check | Status | Evidence |
|-------|--------|----------|
| `canViewAgents` / navigation gating | ✅ Pass | `agents-feature-access.ts` |
| `canExecuteAgents` / start / resume | ✅ Pass | `agents-feature-access.ts` |
| `canManageAgents` | ✅ Pass | `agents-feature-access.ts` |
| Login-app wrappers map permission codes | ✅ Pass | `agents-access.ts` |
| UI gating extraction | ✅ Pass | `agent-ui-gating.ts` |
| Permission catalog i18n (EN/AR) | ✅ Pass | `permission-catalog.json` |

### 7.4 UI (Floating AI Agent)

| Check | Status | Evidence |
|-------|--------|----------|
| Agent tab hidden without `agents.view` | ✅ Pass | `shouldShowAgentsNavigation` + tests |
| History hidden without `agents.view` | ✅ Pass | `agent-workflow-panel.tsx` + tests |
| Start hidden without `agents.execute` | ✅ Pass | panel + tests |
| Resume hidden without `agents.execute` | ✅ Pass | panel + tests |
| Feature-disabled banner | ✅ Pass | panel + tests |
| Permission-denied messages | ✅ Pass | `agents.*` locale keys + tests |
| Super-admin UI bypass | ✅ Pass | integration tests |
| Cancel button | ⚠️ Not implemented | Runtime only |
| Delete / admin list UI | ⚠️ Not implemented | Runtime only |
| `canManageAgents` wired to UI | ❌ Missing | Helper exists, no consumer |

### 7.5 Automated tests

| Suite | Command / path | Status |
|-------|----------------|--------|
| Provider helpers | `lib/platform-ai-provider/src/agents-feature-access.test.ts` | ✅ 65 tests |
| Runtime guards | `lib/agent-runtime/src/utils/agents-guards.test.ts` | ✅ |
| Runtime engine | `lib/agent-runtime/src/executor/agent-execution-engine.test.ts` | ✅ 46 tests |
| Login-app access | `artifacts/login-app/src/lib/platform-ai/agents-access.test.ts` | ✅ 11 tests |
| UI gating pure | `artifacts/login-app/src/lib/platform-ai/agent-ui-gating.test.ts` | ✅ 15 tests |
| UI integration probes | `artifacts/login-app/scripts/agents-ui-permission.integration.test.mts` | ✅ 11 checks |
| RLS feature-flag logic + migration static | `scripts/agents-rls-feature-flag.test.mts` | ✅ 16 checks |
| **Live RLS E2E (agent tables)** | `scripts/agents-rls-e2e-validation.mts` | ⚠️ Harness ready; live run blocked (see I-9) |
| **Run all login-app agent permission tests** | `npm run test:agents-permissions` (login-app) | ✅ |
| Full `AgentWorkflowPanel` render test | — | ❌ Missing (probe-based instead) |
| Browser E2E RBAC matrix | — | ❌ Missing |

---

## 8. Inconsistencies & gaps (report only — not fixed)

| # | Severity | Finding | Layers affected |
|---|----------|---------|-----------------|
| **I-1** | ~~Medium~~ **Resolved (6.2.4)** | ~~`ai_agents` feature flag not in RLS.~~ Now enforced via `company_has_agents_access()`. | ✅ All layers aligned |
| **I-2** | Low | **Cancel supported at runtime but not exposed in UI.** Permission catalog says execute includes cancel; no cancel affordance. | Runtime ALLOW vs UI N/A |
| **I-3** | Low | **`deleteWorkflow` + `canManageAgents` have no UI.** Manage permission enforced only at engine/RLS. | Runtime/RLS vs UI |
| **I-4** | Low | **`listWorkflows` has no UI caller.** Read permission covers listing; no admin inventory screen. | N/A by design until UI built |
| **I-5** | Low | **`agents.manage` has no config/policy operations.** Permission + helpers exist; no CRUD beyond delete. | Future sprint |
| **I-6** | Info | **Missing feature row → ALLOW (undefined).** Matches existing-tenant migration policy; catalog defaults `ai_agents` to disabled when missing. | Product semantics vs runtime default |
| **I-7** | Info | **Chat tab still uses `runtime.execute`**, separate from agent permissions. Manager may use chat path but not Agent tab. | By design (Sprint 6.2 scope) |
| **I-8** | Info | **Platform ops uses super-admin RPC**, not tenant `agents.*` permissions. | Expected for cross-tenant monitor |
| **I-9** | ~~Medium~~ **Partial (6.2.5)** | Live RLS E2E harness added (`scripts/agents-rls-e2e-validation.mts`). Run on 2026-07-31 against linked Supabase: **1/4 preconditions passed** — migrations `195`/`196`/`198` not applied on target DB; full matrix skipped. Re-run after migrate. | Report: `agents-rls-e2e-validation-2026-07-31.md` |
| **I-10** | Low | **Direct Supabase bypass for list vs get.** Service layer and RLS both use `agents.view` for all SELECT; no row-level “own workflow only” scoping. | Defense-in-depth limitation |

---

## 9. Remaining known gaps

1. **UI for manage tier** — delete workflow, tenant workflow inventory, future config screens.
2. **Cancel affordance** — runtime-ready; needs UI + permission-denied copy.
3. **Apply Sprint 6.2 migrations to target Supabase** — `195`, `196`, `197`, `198`; then re-run live RLS E2E.
4. **RLS E2E validation script** — `npx tsx scripts/agents-rls-e2e-validation.mts` (extends `rbac-e2e-validation.mts` pattern).
5. **Role template defaults** — manager/employee do not receive agent permissions; document in admin guide.
6. **Production migration apply** — confirm `196`, `197`, and `198` applied to target Supabase environments.

---

## 10. Recommended future improvements

| Priority | Improvement |
|----------|-------------|
| P1 | Re-run live agent RLS E2E after migrations `195`–`198` applied: `npx tsx scripts/agents-rls-e2e-validation.mts` |
| P2 | Wire `canManageAgentWorkflows` when admin workflow list/delete UI ships. |
| P3 | Add cancel button gated by `canResumeAgentWorkflow` / execute permission. |
| P4 | Browser E2E: Floating AI Agent tab for demo-alpha-admin vs view-only custom role. |
| P5 | Implement reserved `agents.manage` operations (agent policies/config registry) when product defines schema. |

---

## 11. Automated validation commands

```bash
# Runtime + provider unit tests
cd lib/agent-runtime && npm test
cd lib/platform-ai-provider && npm test

# Login-app permission + UI gating tests (Sprint 6.2.2)
cd artifacts/login-app && npm run test:agents-permissions

# Live agent RLS E2E (Sprint 6.2.5 — requires linked Supabase + migrations 195–198)
npx tsx scripts/agents-rls-e2e-validation.mts
```

**Expected:** All suites pass with zero failures.

---

## 12. Sign-off summary

| Area | Status |
|------|--------|
| Permission codes & seeding | ✅ Complete |
| Runtime guards (view / execute / manage) | ✅ Complete |
| RLS alignment (view / execute / delete) | ✅ Complete |
| Provider + login-app helpers | ✅ Complete |
| UI gating (tab, history, start, resume) | ✅ Complete |
| UI gating (cancel, delete, manage screens) | ⚠️ Incomplete |
| Feature flag vs RLS | ✅ Aligned (Sprint 6.2.4 — I-1 closed) |
| Live RLS E2E harness (I-9) | ⚠️ Script + report; full matrix pending migration apply |
| Automated validation docs + tests | ✅ This document + 6.2.2/6.2.4/6.2.5 suites |
| **Overall Sprint 6.2 RBAC validation** | **CONDITIONAL PASS** |

---

---

## 13. Sprint 6.2.5 — Live RLS E2E validation results

**Run date:** 2026-07-31  
**Command:** `npx tsx scripts/agents-rls-e2e-validation.mts`  
**Report:** [`agents-rls-e2e-validation-2026-07-31.md`](./agents-rls-e2e-validation-2026-07-31.md)

| Check | Result |
|-------|--------|
| Script follows `rbac-e2e-validation.mts` pattern | ✅ |
| Real authenticated Supabase sessions | ✅ |
| Scenarios defined (5 actors × SELECT/INSERT/UPDATE/DELETE × feature ON/OFF/tenant) | ✅ |
| Full matrix executed on linked DB | ❌ Blocked |
| **I-9 closure** | **Partial** — harness complete; live pass/fail pending migrations `195`/`196`/`198` on target |

**Live run blockers observed:**

1. `agents.view` / `agents.execute` / `agents.manage` permissions missing → migration `196` not applied.
2. `ai_agents` feature key rejected by `platform_ai_feature_flags_feature_key_check` → migration `195` not applied.
3. RLS matrix skipped until preconditions pass.

**After migrations are applied**, re-run the script to execute ~40+ live scenarios and close I-9 fully.

---

*Document updated for Sprint 6.2.5 (I-9 live RLS E2E harness).*
