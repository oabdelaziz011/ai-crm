# Phase 4.7 — Legacy Cleanup Report

**Date:** 2026-08-03

---

## Removed (Confirmed Dead — 9 files)

| File | Reason |
|------|--------|
| `lib/dashboard/services/dashboard-service.ts` | Zero consumers; superseded by application layer |
| `lib/dashboard/services/dashboard-snapshot-coordinator.ts` | Only imported dashboard-service |
| `lib/dashboard/providers/bookings-metrics-provider.ts` | Dead chain |
| `lib/dashboard/providers/finance-metrics-provider.ts` | Dead chain |
| `lib/dashboard/providers/invoices-metrics-provider.ts` | Dead chain |
| `lib/dashboard/adapters/supabase-dashboard-historical-data-port.ts` | Dead chain |
| `lib/dashboard/adapters/dashboard-historical-read-port-adapter.ts` | Dead chain |
| `lib/dashboard/adapters/supabase-dashboard-metrics-ports.ts` | Dead chain |
| `hooks/universal-operations/use-universal-operations-panel.ts` | Zero consumers |

### Barrel Updates

- `lib/dashboard/index.ts` — removed dead service exports
- `hooks/universal-operations/index.ts` — removed panel export

---

## Quarantined (Not Removed)

| Item | Files | Reason |
|------|-------|--------|
| Legacy executive stack | `lib/executive/**` (~25 files) | Test script dependency |
| Deprecated re-exports | `components/dashboard/notifications-bell.tsx`, etc. | Zero imports but low risk |
| `lib/executive/exports/pdf-exporter.ts` | Zero imports | Keep for future export feature |
| Orphan command DTOs | UpdateCustomer, RefundPayment, CreateTask, UploadFile | Validators exist, handlers missing |
| Unused analytics queries | BookingsAnalytics, PaymentsAnalytics, etc. | Implemented, no UI consumer |

---

## Mock Implementations Still in Production

| Location | Mock | Impact |
|----------|------|--------|
| `create-login-app-application-ports.ts` | `createMockApplicationPorts()` fallback | taskWrite, fileWrite, workflowWrite, knowledgeRead |
| `application-layer-bootstrap.ts` | 7 mock event subscribers | invoice, payment, dashboard, AI, workflow, reports, workspace |
| `use-universal-operations-queue.ts` | `getMockWorkspaceConfig()` | Column metadata only — live booking data |
| `operations-analytics-page.tsx` | Hardcoded metrics | Placeholder UI |

---

## Legacy Notification Paths

| Path | Status |
|------|--------|
| Notification Center UI hooks | ✅ Application Layer (Phase 4.6) |
| `use-notification-preferences.ts` | ⚠️ Direct `getNotificationServices()` |
| Port adapters | ✅ Wrap notification domain service |
| Platform event subscriber | ✅ Live |

---

## Recommended Next Cleanup (Post-Beta)

1. Remove or migrate `lib/executive/` entire stack
2. Replace mock port fallback with explicit no-op ports
3. Replace mock event subscribers with live modules or empty bus
4. Wire `operations-analytics-page` to `AnalyticsApplicationService`
5. Implement or delete orphan command DTOs

---

## Lines Removed: ~28,000 bytes across 9 files
