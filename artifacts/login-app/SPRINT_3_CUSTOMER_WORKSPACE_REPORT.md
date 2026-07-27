# Sprint 3 — Enterprise Customer Workspace

## Summary

Replaced the table + drawer CRM pattern with a **full-page Customer Workspace** at deep-linkable URLs (`/customers/:id/:tab`). All existing hooks, RBAC, and CRUD flows are preserved.

## Before / After

| Area | Before | After |
|------|--------|-------|
| **List** | Flat table rows | Card grid with CRM eyebrow, stats, search |
| **Detail** | Right-side drawer (Sheet) | Full workspace page with sidebar + sticky header |
| **Navigation** | Not URL-addressable | `/customers/{uuid}` and `/customers/{uuid}/{tab}` |
| **Bookings / Invoices tabs** | Placeholders | Live data filtered from `useBookings` / `useInvoices` |
| **Timeline** | Drawer tab only | Dedicated tab + communication history + overview preview |
| **AI** | Placeholder | Rule-based AI Summary (LTV, risk, recommendations) |
| **History** | System IDs only | Audit log (RBAC) + system identifiers |
| **Quick actions** | Drawer only | Sidebar chips + header CTAs; booking/invoice modals stay in workspace context |

## Architecture

```
/customers                    → CustomersPage (list)
/customers/:customerId        → CustomerWorkspacePage (overview)
/customers/:customerId/:tab   → CustomerWorkspacePage (lazy tab)
```

- **Routing:** `customers-layout.tsx` nested under dashboard `/customers` route
- **Context:** `openCustomerProfile()` navigates to workspace URL (drawer removed from provider)
- **Inbox context:** Conversation context stored in `sessionStorage` for WhatsApp handoff

## Sections Implemented

1. **Left sidebar** — Avatar, name, tags, LTV, status, created date, assigned staff (placeholder), quick actions
2. **Header** — Contact channels, Message / New Booking / New Invoice
3. **Tabs (lazy-loaded)** — Overview, Timeline, Bookings, Invoices, Payments, Communication, Notes, Files, AI Summary, History
4. **Overview** — Profile fields, KPIs, upcoming booking, outstanding balance, recent activity
5. **Timeline** — Reuses `CustomerTimelinePanel` (unified event stream)
6. **Bookings** — Today / Upcoming / Past / Cancelled groups
7. **Invoices** — Paid / Pending / Overdue + outstanding total
8. **Payments** — Paid invoice history; refunds/methods empty states
9. **Communication** — Channel launchers + full timeline
10. **Notes** — Reuses inline `NotesTab` / `CustomerFieldEditor`
11. **Files** — Modern empty state (upload disabled until backend exists)
12. **AI Summary** — Client-side insights from existing customer data
13. **History** — `useAuditLogs` filtered by customer + system tab

## Files Added

- `src/lib/customer-workspace/customer-workspace-utils.ts`
- `src/components/customer-workspace/workspace-ui.tsx`
- `src/components/customer-workspace/tabs/workspace-*.tsx` (8 tabs)
- `src/pages/dashboard/customers/customers-layout.tsx`
- `src/pages/dashboard/customers/customer-workspace-page.tsx`

## Files Modified

- `src/pages/dashboard/customers-page.tsx` — Card list, navigate to workspace
- `src/context/customer-profile-context.tsx` — URL navigation, context persistence
- `src/components/customer-profile/types.ts` — Extended tabs
- `src/config/dashboard-route-registry.ts` — Customers layout page
- `src/components/dashboard/dashboard-outlet.tsx` — Nested `/customers` route
- `src/locales/en/common.json`, `src/locales/ar/common.json` — Workspace copy

## Unchanged (per sprint constraints)

- Supabase schema, APIs, RBAC permissions
- `useCustomers`, `useCustomer`, `useBookings`, `useInvoices`, timeline providers
- `CustomerModal` create/edit, `DeleteDialog`, booking/invoice modals
- Assigned staff, file uploads, payment methods/refunds (no backend — empty states)

## Validation

- `pnpm typecheck` — pass
- `pnpm build` — pass
- Customer CRUD: list create/edit/delete unchanged; workspace uses same hooks

## Deep links

Examples:
- `/customers` — list
- `/customers/{id}` — overview
- `/customers/{id}/timeline`
- `/customers/{id}/bookings`
- `/customers/{id}/ai-summary`
