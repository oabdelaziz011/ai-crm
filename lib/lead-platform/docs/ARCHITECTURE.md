# Lead Platform Architecture

Enterprise sales platform — single source of truth for lead lifecycle management.

## Read Path

```
Consumer → LeadReadPort → LeadQueryService (RBAC + cache) → LeadRepository → DB/RPC
```

## Write Path

```
Consumer → LeadCommandService → LeadRepository → Event / Notification / Audit ports
Conversion → LeadConversionPort → Customer (separate entity)
```

## Lead vs Customer

Leads are **pre-conversion** prospects. Customers are created only via `ConvertLead` through `LeadConversionPort`. Leads are never stored as customers.

## Lifecycle

`new` → `qualified` → `contacted` → `demo_scheduled` → `proposal_sent` → `negotiation` → `won` / `lost` → `converted` / `archived`

Stage transitions validated in `stage-transition-validator.ts`.

## Database

Migration `218_lead_platform_foundation_sprint6_11b.sql`:

- `leads`, `lead_pipelines`, `lead_stages`, `lead_sources`
- `lead_assignments`, `lead_scores`, `lead_tags`, `lead_notes`
- `lead_activities`, `lead_history`, `lead_conversion_history`
- `lead_custom_fields`, `lead_import_batches`
- RPC: `lead_platform_company_metrics_v1`

## Events

All domain events map to workflow events (`lead.created`, `lead.converted`, etc.) and webhooks via login-app factory bridge.

## Wiring

| Surface | File |
|---------|------|
| Factory | `artifacts/login-app/src/lib/lead-platform/lead-platform-factory.ts` |
| Conversion | `lead-conversion-port-adapter.ts` |
| Dashboard metrics | `lead-dashboard-read-adapter.ts` |
| REST | `integration-api-gateway-service.ts` + `api-server/.../resources.ts` |

## Repository Visibility

Repositories are internal. External consumers use `LeadCommandService`, `LeadQueryService`, or `LeadReadPort`.
