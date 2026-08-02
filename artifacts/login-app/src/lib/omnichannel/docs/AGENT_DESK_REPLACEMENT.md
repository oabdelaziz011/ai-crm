# Agent Desk — Complete Omnichannel UI Replacement

**Date:** 2026-08-01  
**Scope:** Deleted prior visual workspace. Rebuilt from scratch. Hooks, services, lifecycle, APIs, permissions unchanged.

---

## What Was Deleted

All rejected 3-column / card-inbox / panel-border visual components:

- `omnichannel-workspace-layout.tsx`, `workspace-toolbar.tsx`, `inbox-panel.tsx`
- `conversation-view.tsx`, `customer-header.tsx`, `conversation-action-bar.tsx`
- `conversation-list.tsx`, `conversation-item.tsx`
- `workspace-sidebar.tsx`, `reply-composer.tsx`
- `message-thread.tsx`, `message-bubble.tsx`, `omnichannel-stats-bar.tsx`
- `conversation-queue-bar.tsx`, `collapsible-sidebar-section.tsx`

---

## New Architecture: Agent Desk

**Not a layout iteration — a different product shell.**

```
┌─ Command Deck ────────────────────────────────────────────────┐
│ AGENT DESK · KPI pills · search · filters · Customer 360      │
├──┬────────────────────────────────────────────────────────────┤
│Q │  Full-width Active Session (conversation-first canvas)     │
│u │  · Session identity strip (mono metadata line)             │
│e │  · Command strip (native buttons, not shadcn toolbar)      │
│u │  · Transcript (grid background, asymmetric bubbles)        │
│e │  · Compose panel (floating card, teal accent)             │
│  │                                                            │
│R │  [Queue overlay] — table rows, not cards                   │
│a │  [Insight overlay] — Customer 360 slide-over               │
│i │                                                            │
│l │                                                            │
└──┴────────────────────────────────────────────────────────────┘
```

### Key differences from rejected UI

| Rejected | Agent Desk |
|----------|------------|
| 3 permanent columns | Single canvas + overlays |
| Resizable panels | Fixed queue rail + slide-overs |
| Tall card inbox | Compact table queue (48px rows) |
| Dark cyan panel borders | Teal/violet design tokens (`agent-desk.css`) |
| shadcn Button toolbar | Custom `agent-desk-btn` system |
| Right context column | Customer 360 overlay |
| Chip/stats bar above columns | Inline KPI pills in command deck |

---

## New Files

`components/omnichannel/agent-desk/`

| File | Role |
|------|------|
| `agent-desk.css` | Isolated design tokens |
| `agent-desk-shell.tsx` | Root orchestrator |
| `command-deck.tsx` | Top command bar |
| `queue-rail.tsx` | Vertical queue icon nav |
| `queue-panel.tsx` | Slide-over table inbox |
| `queue-line.tsx` | Table row |
| `active-session.tsx` | Conversation workspace |
| `session-identity-strip.tsx` | Header |
| `session-command-strip.tsx` | Lifecycle actions |
| `transcript-view.tsx` | Virtualized messages |
| `transcript-line.tsx` | Message rendering |
| `compose-panel.tsx` | Composer |
| `insight-panel.tsx` | Customer 360 overlay |
| `filter-popover.tsx` | Filters modal |

`components/omnichannel/types/workspace-labels.ts` — label types (decoupled from deleted sidebar)

---

## Preserved (unchanged)

- `useOmnichannelConsole`, `useConversationLifecycleActions`, `useOmnichannelCustomerContext`
- `EscalationSheet`, `AssignmentSheet`, `LinkCustomerDialog`, `CustomerModal`
- Lifecycle coordinator, backend executor, virtualization utilities
- All permissions and queue filter services

---

## Validation

- `npm run typecheck` — Pass
- `npm run build` — Pass

No git commit per instructions.
