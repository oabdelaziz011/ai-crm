# Clinic Operations Workflow — E2E Test Checklist

**Sprint 4** · Clinic pack on the [Enterprise Workflow Engine](./ENTERPRISE_WORKFLOW_ENGINE_CHECKLIST.md)  
**Prerequisite:** Apply migration `231_scheduling_clinic_workflow_statuses.sql` (adds `with_nurse`, `in_progress`, `archived`).  
**Re-publish** Operations workspace config after seed status changes (or re-seed) so clinic statuses include Waiting → With Nurse → With Doctor → Archived.  
Clinic statuses/transitions/roles are **not** hardcoded in the Operations page — they come from `WORKFLOW_PACK_CLINIC` registered on the Workflow Engine.

---

## 1. Status flow (invalid transitions blocked)

| From | Allowed next | Blocked examples |
|------|----------------|------------------|
| Waiting / Confirmed (`pending`/`confirmed`) | Checked In, Cancel, No-Show | With Nurse, With Doctor, Completed, Archived |
| Checked In | With Nurse, Collect Payment, Cancel, No-Show | With Doctor, Archived |
| With Nurse | Complete Triage, Send To Doctor | Check In, Archive |
| With Doctor (`in_progress`) | Complete Visit | Send To Nurse, Check In |
| Completed | Generate Invoice, Print Receipt (Coming Soon), Archive | Check In, Send To Doctor |
| Archived | Open / View only | Mutating workflow actions |

- [ ] Attempt invalid transition from Action Menu → disabled or error `INVALID_STATUS_TRANSITION`
- [ ] Lifecycle service rejects reverse transitions (e.g. Completed → With Doctor)

---

## 2. Patient journey (happy path)

1. [ ] **Booking created** for today → row appears in Operations Queue (realtime / refresh)
2. [ ] Status shows **Waiting** or **Confirmed**
3. [ ] Reception: **Check In** → status **Checked In**; queue row updates; KPI Waiting decreases
4. [ ] (Optional) Reception/Accountant: **Collect Payment** → payment status updates; KPI Outstanding/Revenue update
5. [ ] Reception: **Send To Nurse** → status **With Nurse**
6. [ ] Nurse: **Complete Triage** → timeline shows triage marker; status remains With Nurse
7. [ ] Nurse: **Send To Doctor** → status **With Doctor**
8. [ ] Doctor: **Complete Visit** → status **Completed**
9. [ ] (Optional) Accountant: **Generate Invoice** → invoice created
10. [ ] (Optional) **Print Receipt** → disabled Coming Soon (expected)
11. [ ] Reception/Accountant/Manager: **Archive** → status **Archived**
12. [ ] Archived row: mutating actions hidden/disabled; **Open** still works

---

## 3. Action menu by status

### Waiting / Confirmed
- [ ] Check In — enabled (reception/manager)
- [ ] Cancel — enabled (reception/manager)
- [ ] Send To Nurse / Complete Visit — not available

### Checked In
- [ ] Collect Payment — when unpaid/partial
- [ ] Send To Nurse — enabled
- [ ] Cancel — enabled

### With Nurse
- [ ] Complete Triage — enabled (nurse/manager)
- [ ] Send To Doctor — enabled (nurse/manager)

### With Doctor
- [ ] Complete Visit — enabled (doctor/manager)

### Completed
- [ ] Generate Invoice — enabled (accountant/manager)
- [ ] Print Receipt — Coming Soon
- [ ] Archive — enabled

### Archived
- [ ] View / Open only

---

## 4. Permissions / clinic roles

Use Customer360 role preview (or mapped workspace role) + RBAC.

| Role | Allowed | Denied examples |
|------|---------|-----------------|
| Reception | Check In, Collect Payment, Cancel, Send To Nurse, Archive | Complete Triage, Complete Visit |
| Nurse | Open, Complete Triage, Send To Doctor | Check In, Collect Payment, Archive |
| Doctor | Open, Complete Visit | Send To Nurse, Cancel |
| Accountant | Collect Payment, Invoice, Refund (Coming Soon), Archive | Check In, Send To Doctor |
| Manager | Everything permitted by status | — |

- [ ] Switch role to Nurse → Check In disabled/hidden by role matrix
- [ ] Switch role to Doctor → Complete Visit available only in With Doctor
- [ ] User without `operations.write` → mutating actions show **No permission**
- [ ] Super admin → all status-valid actions available

---

## 5. Realtime + KPIs

After each successful transition:
- [ ] Queue row status/payment updates without full page reload
- [ ] KPI strip refreshes (Today’s Operations, Waiting, In Progress, Completed, Revenue, Outstanding)
- [ ] Second browser/session sees the same status change (Supabase realtime on `scheduling_bookings`)

---

## 6. Timeline + Customer360 / Workspace

- [ ] Operation Workspace workflow strip highlights current step
- [ ] Timeline tab / Customer360 timeline includes check-in, with nurse, with doctor, triage, completed, archived markers
- [ ] Customer tab still loads existing Customer360 content (no duplication)

---

## 7. Quick Action Bar

- [ ] Bar actions come only from Action Registry `quickBar` surface
- [ ] Bar updates when status changes (e.g. after Check In, Collect/Send To Nurse appear)
- [ ] Confirm dialogs appear for mutating actions; toast on success; invalidate refreshes queue

---

## 8. Regression

- [ ] Queue layout unchanged (density / pins / Customer360 width rules intact)
- [ ] Reference click / double-click / Open action still open Operation Workspace
- [ ] Cancel / No-Show still map to Archived in the queue
- [ ] Non-clinic templates still load (statuses shared seed — verify no crash)

---

## Notes

- **Print Receipt** and **Refund** remain Coming Soon (no inventing backend).
- Existing tenants must **publish** updated operations config (or re-seed) to pick up new status definitions.
- Migration `231` is required for persisted With Nurse / With Doctor / Archived stages.
