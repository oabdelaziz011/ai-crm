# Enterprise Workflow Engine — Validation Checklist

**Sprint 4** · Generic Workflow Engine with Clinic as the first registered pack  
**Related:** Clinic E2E journey details also in [CLINIC_OPERATIONS_WORKFLOW_CHECKLIST.md](./CLINIC_OPERATIONS_WORKFLOW_CHECKLIST.md)

---

## 1. Engine core

- [ ] `EnterpriseWorkflowEngine` loads a `WorkflowDefinition` (states, transitions, stages, KPI buckets, completion rules)
- [ ] `canTransition` / `assertTransition` block invalid edges (`INVALID_STATUS_TRANSITION`)
- [ ] `findTransitionForAction` gates by current state + actor role + optional payment status
- [ ] Transitions declare: from, to, actionId, permissions, confirmation, timeline event, realtimeRefresh
- [ ] Action Registry execute still owns mutations — engine does not duplicate business logic

## 2. Registry / extensibility

- [ ] `registerDefaultWorkflows()` registers **clinic** (production)
- [ ] Construction example pack registers under templateKey `construction` **without engine code changes**
- [ ] `workflowRegistry.hasTemplate("construction") === true`
- [ ] `requireEngine("construction").canTransition("planning", "assigned")`

## 3. Clinic pack (first implementation)

Happy path:

- [ ] Confirmed / Waiting → Check In → Checked In
- [ ] (Optional) Collect Payment
- [ ] Send To Nurse → With Nurse
- [ ] Complete Triage (timeline marker)
- [ ] Send To Doctor → With Doctor (`in_progress`)
- [ ] Complete Visit → Completed
- [ ] (Optional) Generate Invoice
- [ ] Archive → Archived (view / Open only)

Invalid:

- [ ] Checked In → Completed blocked
- [ ] Waiting → With Doctor blocked
- [ ] Archived mutating actions hidden

## 4. Action Registry integration

- [ ] Operations page does **not** hardcode clinic statuses for the ⋮ menu
- [ ] Workflow-bound action availability comes from transition `from` + `actorRoles`
- [ ] Confirmations come from transition specs (fallback to action definition)
- [ ] Non-workflow actions (AI, history Coming Soon, etc.) still use action-local gates

## 5. Permissions (no role logic in UI)

| Role | Allowed transition actions |
|------|----------------------------|
| Reception | Check In, Collect Payment, Cancel, Send To Nurse, Archive |
| Nurse | Open, Complete Triage, Send To Doctor |
| Doctor | Open, Complete Visit |
| Accountant | Collect Payment, Invoice, Archive |
| Manager | All status-valid actions |

- [ ] Role preview uses Workflow `roleAliases` (receptionist→reception, cashier→accountant)
- [ ] UI components do not contain role matrices

## 6. Queue side-effects (no duplicated update logic)

After each successful transition mutation:

- [ ] Operation row updates
- [ ] KPIs refresh from workflow `kpiBuckets`
- [ ] Timeline shows workflow event copy
- [ ] Customer360 / Operation Workspace reflect status
- [ ] Realtime subscribers see the change (existing invalidate + Supabase channel)

## 7. Workflow strip / KPIs

- [ ] Workspace workflow strip uses `resolveWorkflowState(..., templateKey)` from the engine stages
- [ ] KPI Waiting / In Progress / Completed use engine buckets — not hardcoded clinic lists in the page

## 8. Domain lifecycle

- [ ] `BookingLifecycleService` asserts transitions via Clinic workflow graph
- [ ] Migration `231_scheduling_clinic_workflow_statuses.sql` applied in the environment under test

## 9. Regression

- [ ] Queue / Smart Action Engine / Operation Workspace UI unchanged in layout
- [ ] Print Receipt / Refund remain Coming Soon
- [ ] Second workflow (Construction) can be registered without modifying `EnterpriseWorkflowEngine`

---

## Unit tests

```bash
cd lib/universal-operations-engine
npm test -- src/workflow/enterprise-workflow-engine.test.ts
```

- [ ] Clinic happy-path + invalid transitions pass
- [ ] Multi-industry registry test passes
