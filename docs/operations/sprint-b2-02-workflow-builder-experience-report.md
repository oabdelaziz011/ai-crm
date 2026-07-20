# Sprint B2-02 — Enterprise Workflow Experience

**Date:** 2026-07-19  
**Status:** **COMPLETE**

---

## Objective

Transform the B2-01 Workflow Builder into a premium, business-user-focused visual designer without changing backend architecture.

---

## What Changed (Visual Layer Only)

| Area | Enhancement |
|------|-------------|
| Premium nodes | Category color identity, status badge, hover/selected states, animated cards |
| Rich property editors | Notion-style message, button, and question forms |
| Variable picker | Click-to-insert variable browser with categories |
| Live preview | Mock data preview for messages and questions |
| Quick Add | `+` button on node connections with searchable picker |
| Smart search | Palette + quick-add search by business terms |
| Empty state | Guided onboarding CTA when canvas is empty |
| Multi-selection | Selection box, group move, duplicate (Ctrl+D) |
| Alignment | 8 alignment/distribution toolbar actions |
| Auto layout | One-click readable workflow layout |
| Builder status | Saved / Saving / Unsaved / Publishing / Published / validation count |
| Extensibility | Node renderer, variable provider, toolbar action registries |

**Unchanged:** Automation Engine, orchestrator, transport, repositories, database schema, persistence strategy, builder state architecture.

---

## Extension Registries

| Registry | Path |
|----------|------|
| Node Renderer | `core/registry/node-renderer-registry.ts` |
| Variable Provider | `core/variables/variable-provider-registry.ts` |
| Toolbar Actions | `core/toolbar/toolbar-action-registry.ts` |
| Node Definitions | `core/node-registry.ts` (existing, extended with `searchKeywords`) |

Future plugins register renderers, variables, and toolbar actions without modifying builder core.

---

## Variable System

Categories: Customer, Conversation, Booking, Company, System (+ AI reserved)

Token format: `{{customer.name}}` — inserted via UI, rendered in live preview with mock values (e.g. "Omar").

---

## Canvas UX

- React Flow selection box + multi-select (Shift/Meta)
- Quick Add inserts node after connection (reconnects downstream edge)
- Empty canvas shows guided Start CTA
- Auto layout uses layered graph from Start node
- Subtle framer-motion animations on palette, properties, nodes

---

## Tests

```bash
pnpm --dir artifacts/login-app test:workflow-builder-core
```

**17/17 PASS** (10 B2-01 + 7 B2-02 tests)

New coverage: variable preview, smart search, alignment, auto layout, category tokens, duplicate nodes.

---

## Success Criteria

A first-time business user can:

1. See an empty-state guide instead of a blank canvas
2. Add steps via palette drag, quick-add `+`, or Start CTA
3. Edit messages with live preview and variable insertion (no JSON)
4. Search "customer" or "message" to find relevant steps instantly
5. Align and auto-layout workflows for readability
6. Understand save/publish status at all times

The builder presents as a polished enterprise SaaS product — not a developer tool.

**Recommendation:** **READY FOR B2-03** — Runtime execution bindings so published workflow steps trigger real channel messages and CRM actions.
