# Phase 4.7 — Security Certification

**Date:** 2026-08-03  
**Score: 82/100**

---

## Tenant Isolation

| Layer | Mechanism | Status |
|-------|-----------|--------|
| Application Layer | `assertTenant(context, tenantId)` | ✅ |
| Port adapters | `tenantId !== ctx.companyId` guard | ✅ All live adapters |
| Notification read | `company_id` filter + RBAC | ✅ |
| Customer360 aggregator | Customer read scoped to tenant | ✅ |
| Supabase RLS | Database policies (assumed configured) | ⚠️ Not audited in this phase |

**Cross-company isolation:** Port adapters return empty results or throw `Permission denied` on tenant mismatch. No cross-company notification leakage in read port filter.

---

## RBAC

| Check | Implementation |
|-------|----------------|
| Command permissions | `requiredPermissions` on CommandPipeline |
| Query permissions | `requiredPermissions` on QueryPipeline |
| Super admin bypass | `permissions: ["*"]` via `permissionCodes()` |
| Port-level RBAC | `hasPermission()` in each adapter |

**Permission escalation:** No path found for actor to elevate permissions via Application Layer context manipulation. Context is built from auth hook, not user input.

---

## Sensitive Field Filtering

| Area | Status |
|------|--------|
| Customer PII in projections | Display name, email, phone — role-gated via port |
| Payment amounts | Cents in read models, formatted in UI |
| AI tool outputs | Customer summary limited to id, name, email, phone |

---

## Audit Completeness

| Action | Audited |
|--------|---------|
| CreateCustomer | ✅ Event + audit |
| CollectPayment | ✅ Event + audit |
| MarkNotificationRead | ✅ Command pipeline audit |
| ArchiveNotification | ✅ Command pipeline audit |
| MarkAllNotificationsRead | ✅ Command pipeline audit |
| AI tool execution | ⚠️ tool_executions table only |

---

## Notification Isolation

- Read port filters by tenant + optional userId
- Realtime channel: `company_id=eq.${companyId}`
- Platform subscriber creates with envelope.tenantId

---

## Workspace Isolation

- Customer360 workspace hook uses tenant-scoped port context
- Operations queue filtered by companyId in booking read port

---

## Findings

| ID | Severity | Finding |
|----|----------|---------|
| SEC-01 | Medium | Mock port fallback could mask missing write implementations |
| SEC-02 | Low | AI infrastructure tables not behind Application Layer |
| SEC-03 | Low | Global search adapter queries companies table directly |

**Certification: PASS for Beta** with documented medium finding SEC-01.
