# Sprint 6.3 — CRM Agent Hardening

**Status:** In progress  
**Baseline:** Sprint 6.2 RBAC + live RLS validation complete

---

## Sprint 6.3.4 — CRM Permission Alignment

**Date:** 2026-07-31  
**Migration:** `199_crm_agent_permission_alignment_sprint6_3_4.sql`  
**Status:** Implemented

### Problem

CRM agent tools declared agent-specific permission codes (`customers.search`, `customers.update`, `customers.merge`, `customers.import`) that did not match CRM table RLS policies (`customers.view`, `customers.edit`, `customers.create`, `customers.delete`). Default role templates seeded base CRM permissions but not agent-specific codes, causing tool-router passes followed by Supabase RLS failures (especially `update_customer`).

### Solution

1. Aligned `tool_definitions.required_permissions` with CRM RLS codes.
2. Preserved backward compatibility via alias satisfaction in runtime and tool-router.
3. Backfilled RLS permissions for roles holding legacy agent codes.
4. Seeded agent-specific codes into admin/manager/employee templates.
5. Added agent-engine pre-flight permission checks before tool routing.
6. Added localized UI messages for CRM tool permission denials.

### Permission matrix (post 6.3.4)

| CRM Agent Tool | Tool Router / Pre-flight | CRM RLS (data layer) | Legacy alias accepted |
|----------------|--------------------------|----------------------|------------------------|
| `search_customer` | `tools.execute`, `customers.view` | `customers.view` (SELECT) | `customers.search` |
| `find_duplicate_customers` | `tools.execute`, `customers.view` | `customers.view` (SELECT) | `customers.search` |
| `update_customer` | `tools.execute`, `customers.edit` | `customers.edit` (UPDATE) | `customers.update` |
| `merge_customers` | `tools.execute`, `customers.edit`, `customers.delete` | `customers.edit`, `customers.delete` | `customers.merge` (bundle) |
| `import_customers` | `tools.execute`, `customers.create` | `customers.create` (INSERT) | `customers.import` |
| `create_customer` | `tools.execute`, `customers.create` | `customers.create` (INSERT) | — |
| `invoice_search` | `tools.execute`, `invoices.view` | `invoices.view` | — |
| `booking_search` | `tools.execute`, `bookings.view` | `bookings.view` | — |
| `knowledge_search` | `tools.execute`, `knowledge.view` | knowledge RLS | — |

### Role template seeding (migration 199)

| Template | Agent CRM codes added |
|----------|----------------------|
| **admin** | `customers.search`, `customers.update`, `customers.merge`, `customers.import` |
| **manager** | `customers.search`, `customers.update` |
| **employee** | `customers.search` |

Existing base CRM permissions on templates (`customers.view`, `customers.edit`, etc.) are unchanged.

### Backward compatibility

- Legacy permission codes remain in `public.permissions` and the role editor catalog.
- `findMissingAlignedPermission()` accepts legacy aliases at runtime and in tool-router.
- `customers.merge` alone satisfies the full `merge_customers` requirement bundle.
- Migration backfills RLS permissions for roles that already hold legacy agent codes.

### Key files

| Area | Path |
|------|------|
| Permission aliases | `lib/agent-runtime/src/utils/crm-tool-permissions.ts` |
| Agent pre-flight | `lib/agent-runtime/src/executor/agent-execution-engine.ts` |
| Tool router alignment | `lib/ai-tool-router/src/services/tool-router-service.ts` |
| Migration | `supabase/migrations/199_crm_agent_permission_alignment_sprint6_3_4.sql` |
| UI error mapping | `artifacts/login-app/src/lib/platform-ai/agent-ui-gating.ts` |
| Permission catalog | `artifacts/login-app/src/locales/*/permission-catalog.json` |

### Validation

```bash
cd lib/agent-runtime && npm test
cd lib/ai-tool-router && npm test
cd artifacts/login-app && node --import tsx/esm --test src/lib/platform-ai/agent-ui-gating.test.ts
```

Apply migration:

```bash
npx supabase db push --linked
```

---

## Remaining Sprint 6.3 work (not in 6.3.4)

- 6.3.1 Execution concurrency & lifecycle
- 6.3.2 Checkpoint recovery
- 6.3.3 Mid-flight CRM confirmation
- 6.3.5 UI lifecycle completeness (cancel/delete/history)
- 6.3.6 Feature flag & ops hardening
- 6.3.7 Schema indexing
- 6.3.8 Extended validation
- 6.3.9 Server-side execution (stretch)
