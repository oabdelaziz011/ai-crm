# Enterprise E2E Verification Report

**Date:** 2026-07-17T22:53:12.093Z
**Target:** https://lfbtnskmvibikalsxwsm.supabase.co
**Migrations applied:** 047, 048, 049, 050, 099 (+ repair 100)

## Deployment Notes

| Migration | Result | Notes |
|-----------|--------|-------|
| 047 | PASS (after fix) | Initial push failed: missing `END IF` in `is_feature_enabled()`; fixed and re-pushed |
| 048 | PASS | Analytics snapshots |
| 049 | PASS | In-app notification subscriber |
| 050 | PASS | Bus emit + RBAC seeds |
| 099 | PARTIAL | Recorded on remote; DO block rolled back due to profile/company FK order + broad exception handler |
| 100 | PASS | Demo seed repair (company order, subscription_status, triggers, role names) |

## Results

| Category | Test | Result | Detail |
|----------|------|--------|--------|
| Persona Auth | Platform Owner | **PASS** | demo-platform@vaultos.local |
| Persona Auth | Company Admin | **PASS** | demo-beta-admin@vaultos.local |
| Persona Auth | Finance Manager | **PASS** | demo-finance@vaultos.local |
| Persona Auth | Employee | **PASS** | demo-employee@vaultos.local |
| Demo Environment | Demo companies seeded (>=5) | **PASS** | count=5 |
| Demo Environment | Beta failed payment scenario | **PASS** | rows=1 |
| Demo Environment | Demo profiles present (>=5) | **PASS** | count=8 |
| Platform Billing Center | list_billing_payments_paged_v1 | **PASS** | total=3 |
| Platform Billing Center | get_billing_revenue_metrics_v1 | **PASS** | mrr=476.17 |
| Platform Billing Center | list_billing_payment_failures_paged_v1 | **PASS** | total=1 |
| Platform Billing Center | get_payment_provider_health_v1 | **PASS** | providers=5 |
| Workspace Access | Company Admin can_access_workspace | **PASS** |  |
| Workspace Access | Company Admin get_workspace_billing_summary_v1 | **PASS** | DEMO Beta — Active Professional |
| RBAC | Company Admin can_manage_own_billing=true | **PASS** | true |
| Workspace Access | Finance Manager can_access_workspace | **PASS** |  |
| Workspace Access | Finance Manager get_workspace_billing_summary_v1 | **PASS** | DEMO Beta — Active Professional |
| RBAC | Finance Manager can_manage_own_billing=true | **PASS** | true |
| Workspace Access | Employee can_access_workspace | **PASS** |  |
| Workspace Access | Employee get_workspace_billing_summary_v1 | **PASS** | DEMO Beta — Active Professional |
| RBAC | Employee can_manage_own_billing=false | **PASS** | false |
| RBAC | Employee denied platform payments list | **PASS** | Insufficient permissions |
| RBAC | Employee denied revenue metrics | **PASS** | Insufficient permissions |
| Notification Bus | billing_event_catalog active entries | **PASS** | entries=1 |
| Notification Bus | notification_bus_publish_v1 (company admin) | **PASS** | event_id=9282ec1e-5b17-4e65-97aa-eaf027f447dd |
| Notification Bus | Event persisted in billing_notification_events | **PASS** | pending |
| Notification Bus | In-app subscriber created notification | **PASS** | notifications.events.billing.generic.title |
| Sandbox Mode | payment_sandbox_mode platform=true | **PASS** | true |
| Sandbox Mode | sandbox provider active | **PASS** | DEMO Sandbox (Test) |
| Analytics | financial_compute_analytics_snapshot_v1 | **PASS** | mrr=476.1666666666667 |
| Analytics | financial_analytics_snapshots row exists | **PASS** | date=2026-07-17 |
| Backward Compatibility | list_company_subscriptions_paged (Phase A RPC) | **PASS** | total=5 |
| Backward Compatibility | list_billing_audit_logs_paged | **PASS** | total=4 |

## Summary

- **Passed:** 32
- **Failed:** 0
- **Release recommendation:** Proceed to Release Review (Phase C not authorized until approved)

## Phase C Status

**NOT AUTHORIZED** — awaiting successful Enterprise E2E and Release Review approval.
