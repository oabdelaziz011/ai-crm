# Ticket Platform Architecture

## Overview

`@workspace/ticket-platform` is the enterprise ticket domain layer and single source of truth for all ticket operations. AI tools, REST APIs, Customer 360, dashboards, omnichannel, workflows, and notifications consume this package — they do not implement ticket business logic independently.

## Read Path (Golden Template)

```
Consumer
  → TicketReadPort (public)
    → TicketQueryService (RBAC + cache)
      → TicketRepository (internal, Supabase)
      → Database / SQL RPC
```

## Write Path

```
Consumer
  → TicketCommandService
    → TicketRepository
    → Event / Notification / Audit ports
```

## Public API Surface

| Export | Purpose |
|--------|---------|
| `createTicketPlatformServices()` | Composition root (commands, queries, reads) |
| `TicketReadPort` | External read-only API |
| `TicketQueryCachePort` | Pluggable cache (InMemory default; Redis-ready) |
| `TicketCommandService` / `TicketQueryService` | Internal services (also used by REST/AI) |

Repositories are **not exported**. The `./repositories` subpath was removed in Sprint 6.9.2B.

## Metrics

Company metrics are computed in PostgreSQL via `ticket_platform_company_metrics_v1` (migration 216). The application receives aggregated JSON only — no full-table hydration.

## Cache

`TicketQueryService` uses `TicketQueryCachePort` with TTLs defined in `TICKET_QUERY_CACHE_TTL`. Swap `InMemoryTicketQueryCache` for Redis by injecting a compatible adapter at platform bootstrap.

## Wiring (Application Layer)

| Surface | Wiring file |
|---------|-------------|
| Login app reads | `artifacts/login-app/src/lib/ticket-platform/ticket-read-port-adapter.ts` |
| Dashboard metrics | `artifacts/login-app/src/lib/ticket-platform/ticket-dashboard-read-adapter.ts` |
| Customer 360 | `ticketReads` injected into `createSupabaseCustomer360DataPort` |
| AI tools | `createTicketAgentToolPortsFromPlatform(platform)` |
| REST API | `IntegrationApiGatewayService` → `platform.queries` / `platform.commands` |

## Database

- Migration 214: core tables, RLS, RBAC
- Migration 215: SLA columns, indexes
- Migration 216: SQL metrics aggregation RPC
