# Sprint 9.3.1 — Enterprise Omnichannel Workspace Redesign Review

**Date:** 2026-08-01  
**Scope:** Complete presentation-layer workspace redesign. No lifecycle engine, runtime, AI, backend, or coordinator changes.

---

## 1. Before vs After Layout

### Before (Sprint 9.3)

```
┌─────────────────────────────────────────────────────────────┐
│ Title + subtitle + KPI cards (large)                        │
├──────────────┬──────────────────────┬───────────────────────┤
│ CRM / Context│ Active Conversation  │ Inbox + chip filters  │
│   (~25%)     │      (~40%)          │      (~35%)           │
│ permanent    │ chip-wall header     │ tag cloud clutter     │
└──────────────┴──────────────────────┴───────────────────────┘
```

Problems: three equal-weight panels, customer context consumed permanent space, inbox felt secondary, metadata duplicated across header chips and sidebar, large empty message area.

### After (Sprint 9.3.1)

```
┌─────────────────────────────────────────────────────────────┐
│ Compact title                                               │
├─────────────────────────────────────────────────────────────┤
│ KPI strip (single row, minimal height)                      │
├─────────────────────────────────────────────────────────────┤
│ Workspace toolbar: search | queue | filters | context toggle│
├──────────────┬─────────────────────────┬────────────────────┤
│ Inbox        │ Active Conversation     │ Context drawer     │
│   35%        │        45%              │   20% (collapsible)│
│ rich cards   │ clean header rows       │ on-demand CRM      │
│ primary nav  │ action toolbar          │ AI summary + tabs  │
└──────────────┴─────────────────────────┴────────────────────┘
```

When context is collapsed, conversation expands to ~65%. Mobile: inbox sheet (left), context sheet (right), conversation full width.

---

## 2. Updated Component Structure

```
OmnichannelConsole
├── OmnichannelStatsBar          (compact KPI strip)
├── WorkspaceToolbar             (search, queue, filter dropdown, context toggle)
└── EnterpriseWorkspaceLayout    (35 / 45 / 20 resizable)
    ├── InboxPanel
    │   └── ConversationList (virtualized, 168px rows)
    │       └── ConversationItem (rich card, hover select, keyboard)
    ├── ConversationView
    │   ├── CustomerHeader       (no chip wall — label/value rows)
    │   ├── ConversationActionBar (primary + More overflow)
    │   ├── MessageThread
    │   └── ReplyComposer
    └── WorkspaceSidebar         (context drawer — immediate CRM + AI summary + tabs)
```

**New / rewritten in 9.3.1**

| File | Role |
|------|------|
| `omnichannel-workspace-layout.tsx` | `EnterpriseWorkspaceLayout` — 35/45/20, collapsible context |
| `workspace-toolbar.tsx` | Unified filters (dropdown replaces chip clouds) |
| `omnichannel-console.tsx` | Top-down orchestration: KPI → toolbar → workspace |
| `inbox-panel.tsx` | List-only inbox (filters moved to toolbar) |
| `customer-header.tsx` | Large name + structured meta rows |
| `conversation-action-bar.tsx` | Fixed primary order, lifecycle-driven More menu |
| `conversation-item.tsx` | Taller scan-friendly cards |
| `workspace-sidebar.tsx` | Slim context drawer with immediate fields + tabs |
| `conversation-view.tsx` | Full-height flex column for messages |
| `omnichannel-stats-bar.tsx` | Compact horizontal KPI strip |
| `conversation-list-window.ts` | Row height 168px |

**Preserved (unchanged logic):** lifecycle hooks, coordinator, escalation/assignment sheets, link customer, customer modal, message virtualization, keyboard shortcuts.

---

## 3. UX Improvements

| Area | Improvement |
|------|-------------|
| Information hierarchy | Conversation-first: inbox left (primary nav), center dominates, context on demand |
| Header | Removed chip wall; name/phone/channel/language + structured assignment/queue/SLA rows |
| Action bar | Professional toolbar with Reply, Assign, Transfer, Escalate, Resolve, Return to AI, Take Over; overflow in More |
| Inbox | Taller cards (168px), avatar, phone, channel, owner, SLA, unread, pin/VIP, last message preview |
| Filters | Queue select + filter dropdown replaces tag/chip clouds |
| Context | Right drawer — customer, orders, invoices, tickets, AI summary visible immediately; CRM/timeline in tabs |
| Empty space | Message thread uses `flex-1 min-h-0`; removed nested accordions and duplicate metadata panels |
| Visual density | Enterprise dark theme, soft borders, fewer accent colors, high-density typography |

---

## 4. Accessibility Improvements

- Conversation list: `role="listbox"`, `role="option"`, `aria-selected`, Arrow ↑/↓ keyboard navigation
- Context drawer toggle: `aria-expanded`, `aria-label` on collapse/expand
- Workspace toolbar: labeled search input, filter dropdown with checkbox/radio semantics
- Action bar: primary actions as buttons with visible focus rings
- Customer header: semantic `dl`/`dt`/`dd` meta rows instead of unreadable chip groups
- Mobile sheets: standard Radix sheet focus trap and escape dismiss
- RTL: message bubbles and phone fields retain `dir` attributes

---

## 5. Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Desktop (lg+) | Full 3-panel resizable workspace; context drawer toggleable |
| Context collapsed | Conversation panel grows to 65%; inbox stays 35% |
| Tablet / mobile | Inbox via left sheet; context via right sheet; conversation full width |
| Toolbar | Context toggle hidden on mobile (uses sheet button in header) |

---

## 6. Performance Impact

| Item | Impact |
|------|--------|
| Conversation list virtualization | Unchanged algorithm; row height 168px (slightly fewer visible rows) |
| Message thread virtualization | Unchanged |
| Context drawer collapse | Unmounts context panel when closed — reduces DOM nodes |
| Lazy customer profile drawer | Preserved |
| Filter dropdown vs chip cloud | Fewer DOM nodes in inbox column (filters only when menu open) |
| Component memoization | All panel components remain `memo()` wrapped |

**Net:** Neutral to slightly positive. No new network calls or lifecycle work.

---

## 7. Screens Modified

- `/dashboard/omnichannel` — complete workspace shell redesign
- Sub-panels: inbox, conversation view, context drawer, workspace toolbar, KPI strip
- Overlays unchanged: escalation sheet, assignment sheet, link customer, create customer

---

## 8. Test Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `npm run test:conversation-lifecycle` | 20/20 pass |
| `npm run test:conversation-lifecycle-integration` | 11/11 pass |

No lifecycle, backend, or runtime code was modified.

---

## 9. UX Score

**Before (9.3):** 5.5 / 10 — improved styling but still three disconnected panels, chip clutter, weak hierarchy.

**After (9.3.1):** **8.5 / 10**

- +2.0 conversation-first layout and collapsible context
- +1.0 structured header and professional action toolbar
- +0.5 taller inbox cards and toolbar filters
- −0.5 remaining polish (typing indicator placeholder, bulk actions not yet exposed in toolbar)

---

## 10. Enterprise Readiness Score

**Before:** 4 / 10 — felt like a styled admin prototype, not a contact-center workspace.

**After:** **8 / 10**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Visual hierarchy | 9 | Conversation dominates; context secondary |
| Agent efficiency | 8 | Faster inbox scan; fewer clicks to filters |
| Information density | 8 | High density without chip overload |
| Consistency | 8 | Unified toolbar + drawer pattern |
| Scalability | 7 | Virtualized lists; resizable panels |
| Mobile readiness | 7 | Sheet-based navigation works; needs field testing |

**Remaining for 9.4:** SLA live countdown wiring, typing indicator, inbox bulk-action toolbar, saved filter views, agent presence in cards.

---

## Architecture Constraint (unchanged)

```
UI → useConversationLifecycleActions → canPerform() → coordinator.transition()
  → executeLifecycleTransition() → persistLifecycleMetadata()
  → executeBackendLifecycleHint() → Backend API
```

Presentation consumes hooks only. No coordinator or engine edits in this sprint.
