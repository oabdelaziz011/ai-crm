# Universal Operations Engine — Architecture

Sprint OP1 delivers a metadata-driven operations workspace engine with mock data only.

## Core Principle

One reusable engine. Business type is defined entirely by configuration metadata — never hardcoded in UI.

## Package

`@workspace/universal-operations-engine`

| Area | Purpose |
|------|---------|
| `constants/field-types.ts` | Supported column field types, module tabs |
| `types/metadata-types.ts` | Column, status, service, workspace config |
| `types/row-types.ts` | Operational rows, queue queries |
| `types/panel-types.ts` | Customer workspace panel mock DTOs |
| `engine/metadata-engine.ts` | Column resolution, rename, reorder |
| `mock/*` | Clinic, training, automotive templates + 120 rows |

## UI Module

Route: `/dashboard/operations`

Tabs: Queue · Calendar · Kanban · Timeline · Configuration · Analytics

Queue uses `OperationsDataGrid` with virtual scrolling, sticky headers, column metadata, saved views placeholder, bulk/export/import placeholders.

Row click opens `OperationsWorkspacePanel` (right sheet) — does not navigate away.

## Integration Status

| Surface | Sprint OP1 |
|---------|------------|
| Live CRM / bookings / invoices | Mock only |
| Appointment Platform | Not wired |
| Customer360 | Mock panel data |
| RBAC persistence | Configuration tab gated by `operations.universal.configure` |
| Realtime | Ready hooks, mock refresh |

## Next Sprint

Wire read ports from Appointment, Customer360, Lead, Financial platforms. Persist configuration to Supabase.
