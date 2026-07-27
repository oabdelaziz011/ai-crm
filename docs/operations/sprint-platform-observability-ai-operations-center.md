# Sprint Platform-Observability — AI Operations Center

## Route

**Platform → AI Operations Center**  
`/dashboard/platform/ai-operations`  
Super Admin only

## Architecture

```
PlatformAiOperationsPage
  ├── OpsKpiGrid              ← RPC platform_ai_ops_kpi_summary
  ├── OpsProviderHealth       ← RPC platform_ai_ops_provider_health
  ├── OpsGlobalSearch + Export
  └── Tabs
        ├── Request Monitor   ← RPC platform_ai_ops_request_feed (paginated)
        ├── Tool Monitor      ← RPC platform_ai_ops_tool_stats
        ├── Background Tasks  ← platform_ai_background_tasks
        ├── Error Center      ← RPC platform_ai_ops_error_groups
        ├── Token & Cost      ← RPC cost_trends + cost_by_company
        ├── Feature Flags     ← RPC platform_ai_ops_feature_matrix
        └── Admin Audit       ← RPC platform_ai_ops_admin_audit
```

### Data sources

| Layer | Tables |
|-------|--------|
| Request telemetry | `ai_execution_analytics`, `platform_ai_usage` |
| Runtime pipeline | `runtime_executions`, `runtime_execution_steps`, `runtime_execution_errors` |
| Platform config | `platform_ai_feature_flags`, `platform_ai_providers` |
| Background tasks | `platform_ai_background_tasks` |
| Alerts | `platform_ai_ops_alerts` |
| Audit | `audit_logs` (AI/platform entities) |

All RPCs enforce `platform_ai_ops_assert_super_admin()`.

### Telemetry ingestion

Runtime completion now writes to `platform_ai_usage` via `observability-adapter.ts` (in addition to `ai_execution_analytics`).

## Security

- Route: `superAdminOnly: true` in dashboard registry
- RPCs: super-admin gate inside PostgreSQL
- API keys never displayed — `maskSecret()` for correlation IDs in error center
- Prompts not shown in request monitor (metadata only)

## Alerts (examples)

| Alert | Trigger |
|-------|---------|
| `provider_down` | OpenAI health status = red |
| `latency_spike` | Average latency > 10s today |
| `queue_backlog` | Background tasks > 50 |

Evaluated on dashboard load via `platform_ai_ops_evaluate_alerts()`.

## Performance

- Server-side aggregation via RPCs (no client-side full-table scans)
- React Query polling: KPIs/health 30s, requests 15s, tasks 10s
- Scrollable tables with sticky headers
- Lazy-loaded page via route registry

## Export

Request monitor supports CSV and JSON export from current page data.

## Production readiness

- [x] Migration 173 with RPCs + tables
- [x] Super-admin UI + access denied gate
- [x] Realtime polling refresh
- [x] Platform usage recording wired
- [x] EN i18n
- [ ] Apply migration 173 to live Supabase
- [ ] AR locale strings
- [ ] Browser screenshot evidence
- [ ] Virtualized table for 10k+ rows (follow-up: `@tanstack/react-virtual`)

## Test plan

1. Login as `demo-platform@vaultos.local`
2. Navigate to **AI Operations Center** in sidebar
3. Verify KPI cards load (may show zeros on fresh DB)
4. Run AI chat to generate telemetry → refresh → see request in monitor
5. Search by company name or correlation ID
6. Export CSV/JSON
7. Confirm non-super-admin gets access denied
