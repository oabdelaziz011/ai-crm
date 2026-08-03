# Phase 4.7 — AI Compliance Report

**Date:** 2026-08-03  
**Objective:** Every AI capability must consume ONLY the Application Layer for business domain data.

---

## Audit Summary

| Category | Count (Pre-4.7) | Count (Post-4.7) | Status |
|----------|-----------------|------------------|--------|
| AI Direct Supabase (CRM tools) | 8 files | 0 in CRM path | ✅ Fixed |
| AI Direct Repository (business) | 12+ adapters | 8 remaining | ⚠️ Partial |
| AI Hook Usage (runtime bootstrap) | 10 files | 10 files | ⚠️ UI wiring only |
| AI Business Module Coupling | 15+ files | 10 files | ⚠️ Partial |
| Application Layer Query Coverage | 0/11 | 4/11 wired | ⚠️ In progress |

---

## AI Direct Repository Access

### Fixed in Phase 4.7

| File | Before | After |
|------|--------|-------|
| `crm-agent-adapter.ts` | `createSupabaseCrmAgentToolPorts` | `createApplicationLayerCrmAgentToolPorts` |
| `use-crm-agent-tool-ports.ts` | `supabase.rpc("knowledge_keyword_search")` | Retrieval engine only |
| `customer-service-adapter.ts` | `createSupabaseCustomerServicePort` | Application Layer `customerRead`/`customerWrite` |

### Remaining (AI Infrastructure — Acceptable for Beta)

| Package | Tables | Rationale |
|---------|--------|-----------|
| `lib/ai-conversation` | conversations, messages | AI channel infra |
| `lib/ai-tool-router` | tool_definitions, tool_executions | Tool registry |
| `lib/ai-execution-engine` | ai_executions | Runtime telemetry |
| `lib/ai-employees` | ai_employees, skills | Employee config |
| `lib/ai-observability` | traces, spans | Observability |

### Remaining (Business Domain — Beta Debt)

| File | Violation |
|------|-----------|
| `scheduling-tool-ports-adapter.ts` | Platform factory → Supabase scheduling reads |
| `ticket-tool-ports-adapter.ts` | Ticket platform factory |
| `handoff-tool-ports-adapter.ts` | Handoff platform factory |
| `runtime-port-options.ts` | `createSupabaseCustomer360DataPort` |
| `lib/ai-tool-router/src/adapters/supabase-crm-agent-tool-ports.ts` | Still exported from package (unused by login-app CRM path) |

---

## AI Direct Supabase Access

### Eliminated from Login-App CRM Path

- No `supabase.from()` in `application-layer-crm-agent-tool-ports.ts`
- No `supabase.rpc()` in `use-crm-agent-tool-ports.ts`

### Still Present (Non-CRM)

- `ai-tool-router/index.ts` — passes `supabase` to scheduling/ticket/lead/handoff adapters
- `runtime-integration/observability-adapter.ts` — `platform_ai_usage` insert
- AI employee repositories — configuration tables

---

## AI Hook Usage

React hooks in bootstrap modules are **UI composition layer**, not AI runtime logic:

- `lib/ai-tool-router/index.ts` — `useToolRouterServices()`
- `lib/runtime-integration/index.ts` — composes AI services for chat UI

**Verdict:** Acceptable — hooks do not execute business logic; they wire Application Layer ports into tool runtime.

---

## AI Query Coverage

| Application Layer Query | AI Consumer | Status |
|-------------------------|-------------|--------|
| Customer360Aggregate | `ai-application-layer-client` | ✅ Available |
| OperationsQueue | `ai-application-layer-client` | ✅ Available |
| Dashboard | `ai-application-layer-client` | ✅ Available |
| Timeline | `ai-application-layer-client` | ✅ Available |
| NotificationCenter | `ai-application-layer-client` | ✅ Available |
| Workspace | `ai-application-layer-client` | ✅ Available |
| Analytics | `ai-application-layer-client` | ✅ Available |
| ExecutiveInsights | `ai-application-layer-client` | ✅ Available |
| Knowledge (getDocument) | `ai-application-layer-client` | ✅ Available |
| Revenue | — | ❌ Not wired |
| GlobalSearch | — | ❌ No query service yet |

### CRM Agent Tool Mapping

| Tool | Application Layer Port |
|------|------------------------|
| searchCustomers | `customerRead.search`, `globalSearchRead.search` |
| updateCustomer | `customerWrite.update` |
| importCustomers | `customerWrite.create` |
| searchBookings | `bookingRead.listQueue`, `listForCustomer` |
| searchInvoices | `invoiceRead.listForCustomer` |
| knowledgeSearch | Retrieval engine (vector, not Supabase RPC) |
| mergeCustomers | ❌ Blocked — no Application Layer command |

---

## AI Application Layer Client

Canonical entry point: `artifacts/login-app/src/lib/application-layer/ai-application-layer-client.ts`

All new AI capabilities MUST use `createAiApplicationLayerClient(portContext)`.

---

## Compliance Score: 75/100

**Beta acceptable** for CRM-focused AI agents. Full compliance requires scheduling/ticket/handoff tool migration in a future phase.
