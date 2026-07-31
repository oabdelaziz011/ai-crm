# AI Agent RLS Live E2E Validation Report

**Sprint:** 6.2.5
**Date:** 2026-07-31
**Result:** 46/46 passed (100%)
**Issue target:** I-9 (RLS E2E for agent tables)

## Preconditions

- Live Supabase project linked via `artifacts/login-app/.env.local`
- Migrations `196`, `197`, and `198` applied
- Demo personas available (`demo-platform`, `demo-beta-admin`, etc.)
- Temporary `user_permissions` grants for View Only / Runtime Execute personas (restored after run)

## Summary

| Metric | Value |
|---|---|
| Total scenarios | 46 |
| Passed | 46 |
| Failed | 0 |
| I-9 status | **CLOSED** |

## Detailed results

| Result | Scenario | Actor | Table | Op | Feature | Policy | Expected | Actual | Detail |
|---|---|---|---|---|---|---|---|---|---|
| PASS | Precondition — ai_agents effective for beta | Company Admin | platform_ai_feature_flags | SELECT | ON | platform_ai_feature_enabled(..., 'ai_agents') | ALLOW | ALLOW | row=missing→coalesce true |
| PASS | Actor permission precondition | Company Admin | permissions | SELECT | n/a | user_has_permission() | ALLOW | ALLOW | agents.view |
| PASS | Actor permission precondition | Company Admin | permissions | SELECT | n/a | user_has_permission() | ALLOW | ALLOW | agents.execute |
| PASS | Actor permission precondition | Company Admin | permissions | SELECT | n/a | user_has_permission() | ALLOW | ALLOW | agents.manage |
| PASS | Actor permission precondition | Runtime Execute | permissions | SELECT | n/a | user_has_permission() | ALLOW | ALLOW | agents.view |
| PASS | Actor permission precondition | Runtime Execute | permissions | SELECT | n/a | user_has_permission() | ALLOW | ALLOW | agents.execute |
| PASS | Actor permission precondition | Runtime Execute | permissions | SELECT | n/a | user_has_permission() | DENY | DENY | agents.manage |
| PASS | Actor permission precondition | View Only | permissions | SELECT | n/a | user_has_permission() | ALLOW | ALLOW | agents.view |
| PASS | Actor permission precondition | View Only | permissions | SELECT | n/a | user_has_permission() | DENY | DENY | agents.execute |
| PASS | Actor permission precondition | View Only | permissions | SELECT | n/a | user_has_permission() | DENY | DENY | agents.manage |
| PASS | Actor permission precondition | No Permission | permissions | SELECT | n/a | user_has_permission() | DENY | DENY | agents.view |
| PASS | Actor permission precondition | No Permission | permissions | SELECT | n/a | user_has_permission() | DENY | DENY | agents.execute |
| PASS | Feature ON — read own-tenant workflow | Super Admin | agent_workflows | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read workflow event | Super Admin | agent_workflow_events | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read workflow checkpoint | Super Admin | agent_workflow_checkpoints | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read own-tenant workflow | Company Admin | agent_workflows | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read workflow event | Company Admin | agent_workflow_events | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read workflow checkpoint | Company Admin | agent_workflow_checkpoints | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read own-tenant workflow | Runtime Execute | agent_workflows | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read workflow event | Runtime Execute | agent_workflow_events | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read workflow checkpoint | Runtime Execute | agent_workflow_checkpoints | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read own-tenant workflow | View Only | agent_workflows | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read workflow event | View Only | agent_workflow_events | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read workflow checkpoint | View Only | agent_workflow_checkpoints | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |
| PASS | Feature ON — read own-tenant workflow | No Permission | agent_workflows | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | DENY | DENY | rows=0 |
| PASS | Feature ON — read workflow event | No Permission | agent_workflow_events | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | DENY | DENY | rows=0 |
| PASS | Feature ON — read workflow checkpoint | No Permission | agent_workflow_checkpoints | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | DENY | DENY | rows=0 |
| PASS | Feature ON — insert workflow | Company Admin | agent_workflows | INSERT | ON | company_has_agents_access(company_id, 'agents.execute') | ALLOW | ALLOW | ok |
| PASS | Feature ON — insert workflow | Runtime Execute | agent_workflows | INSERT | ON | company_has_agents_access(company_id, 'agents.execute') | ALLOW | ALLOW | ok |
| PASS | Feature ON — insert workflow | View Only | agent_workflows | INSERT | ON | company_has_agents_access(company_id, 'agents.execute') | DENY | DENY | new row violates row-level security policy for table "agent_workflows" |
| PASS | Feature ON — insert workflow | No Permission | agent_workflows | INSERT | ON | company_has_agents_access(company_id, 'agents.execute') | DENY | DENY | new row violates row-level security policy for table "agent_workflows" |
| PASS | Feature ON — update workflow | Company Admin | agent_workflows | UPDATE | ON | company_has_agents_access(company_id, 'agents.execute') | ALLOW | ALLOW | affected=1 |
| PASS | Feature ON — update workflow | Runtime Execute | agent_workflows | UPDATE | ON | company_has_agents_access(company_id, 'agents.execute') | ALLOW | ALLOW | affected=1 |
| PASS | Feature ON — update workflow | View Only | agent_workflows | UPDATE | ON | company_has_agents_access(company_id, 'agents.execute') | DENY | DENY | affected=0 |
| PASS | Feature ON — insert workflow event | Runtime Execute | agent_workflow_events | INSERT | ON | company_has_agents_access(company_id, 'agents.execute') | ALLOW | ALLOW | ok |
| PASS | Feature ON — insert workflow event | View Only | agent_workflow_events | INSERT | ON | company_has_agents_access(company_id, 'agents.execute') | DENY | DENY | new row violates row-level security policy for table "agent_workflow_events" |
| PASS | Feature ON — insert workflow checkpoint | Runtime Execute | agent_workflow_checkpoints | INSERT | ON | company_has_agents_access(company_id, 'agents.execute') | ALLOW | ALLOW | ok |
| PASS | Feature ON — delete workflow with agents.manage | Company Admin | agent_workflows | DELETE | ON | company_has_agents_access(company_id, 'agents.manage') | ALLOW | ALLOW | affected=1 |
| PASS | Feature ON — delete workflow without agents.manage | Runtime Execute | agent_workflows | DELETE | ON | company_has_agents_access(company_id, 'agents.manage') | DENY | DENY | affected=0 |
| PASS | Feature OFF precondition | Company Admin | platform_ai_feature_flags | SELECT | OFF | platform_ai_feature_enabled(..., 'ai_agents') | DENY | DENY | rpc=false |
| PASS | Feature OFF — read workflow blocked by feature flag | Company Admin | agent_workflows | SELECT | OFF | company_has_agents_access(company_id, 'agents.view') | DENY | DENY | rows=0 |
| PASS | Feature OFF — insert workflow blocked by feature flag | Company Admin | agent_workflows | INSERT | OFF | company_has_agents_access(company_id, 'agents.execute') | DENY | DENY | new row violates row-level security policy for table "agent_workflows" |
| PASS | Feature OFF — update workflow blocked by feature flag | Company Admin | agent_workflows | UPDATE | OFF | company_has_agents_access(company_id, 'agents.execute') | DENY | DENY | affected=0 |
| PASS | Tenant mismatch — cross-company SELECT hidden | Alpha Admin (tenant mismatch) | agent_workflows | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | DENY | DENY | rows=0 |
| PASS | Tenant mismatch — INSERT into other company | Alpha Admin (tenant mismatch) | agent_workflows | INSERT | ON | company_has_agents_access(company_id, 'agents.execute') | DENY | DENY | new row violates row-level security policy for table "agent_workflows" |
| PASS | Super Admin cross-tenant read bypass | Super Admin | agent_workflows | SELECT | ON | company_has_agents_access(company_id, 'agents.view') | ALLOW | ALLOW | rows=1 |

## Policies exercised

- `agent_workflows_select` → `company_has_agents_access(company_id, 'agents.view')`
- `agent_workflows_insert` / `agent_workflows_update` → `agents.execute`
- `agent_workflows_delete` → `agents.manage`
- `agent_workflow_events_select` / `agent_workflow_checkpoints_select` → `agents.view`
- `agent_workflow_events_insert` / `agent_workflow_checkpoints_insert` → `agents.execute`

*Generated by `scripts/agents-rls-e2e-validation.mts`. Failures are reported only — no automatic fixes.*
