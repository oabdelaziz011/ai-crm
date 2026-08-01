# Omnichannel Module Audit — Sprint 9.1 (Pre-Lifecycle)

> Architecture-only audit. No runtime, UI, or channel integration changes.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Route: /dashboard/omnichannel                                          │
│  Page: omnichannel-console-page.tsx                                     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│  UI Layer (components/omnichannel/)                                     │
│  omnichannel-console → workspace-layout → list / view / sidebar         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│  Hooks Layer                                                            │
│  use-omnichannel-console, use-conversation-list/messages/actions/reply  │
│  use-conversation-realtime, use-team-inbox-reply                        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼────────┐   ┌──────────▼─────────┐   ┌────────▼──────────────┐
│ lib/omnichannel│   │ @workspace/        │   │ sessionStorage overlay│
│ aggregators    │   │ ai-conversation    │   │ operational-store     │
│ queues, AI     │   │ services + DB      │   │ assignment/escalation │
└────────────────┘   └────────────────────┘   └───────────────────────┘
```

### Backend-backed (authoritative)

| Concern | Source | Entry point |
|---------|--------|-------------|
| Conversation list | Supabase `conversations` | `use-conversation-list` → `conversationService.list` |
| Messages | Supabase `conversation_messages` | `use-conversation-messages` |
| Assign / release / close | `conversationService` | `use-conversation-actions` |
| Reply + dispatch | `messageService` + channel dispatcher | `use-team-inbox-reply` |
| Realtime invalidation | Supabase subscriptions | `use-conversation-realtime` |
| RBAC | `ai.conversations.*` permissions | `<Can>` + `permissions.ts` |
| State machine (AI runtime) | `lib/ai-conversation/state-machine` | Used by AI platform, **not** omnichannel UI |

### Client-only (non-authoritative)

| Concern | Source | Problem |
|---------|--------|---------|
| Team/dept/queue/AI assignment | `conversation-operational-store.ts` | sessionStorage, not multi-user |
| Escalation records | `conversation-operational-store.ts` | sessionStorage, not persistent |
| Queue routing | `conversation-queues.ts` | Filter views only, not routing entities |
| SLA display | Header heuristic | No backend SLA |
| CRM context | Stub query | Placeholder zeros |

---

## Conversation State Flow (Current)

Backend states (`@workspace/ai-conversation`):

```
idle → greeting → collecting_information ⇄ waiting_user ⇄ waiting_api
                      ↓                      ↓
                 transferred_to_human    completed → closed
                      ↓                      ↓
                    closed              cancelled → closed
```

Omnichannel UI derives `handlerMode`:

- `human` if `transferred_to_human` OR `assigned_user_id` set
- `mixed` if `waiting_api`
- else `ai`

**Gap:** UI displays raw backend `state` strings. No unified enterprise lifecycle.

---

## Ownership Flow (Current)

| Layer | Field | Precedence in UI |
|-------|-------|------------------|
| Backend | `assigned_user_id` | Lower |
| Backend | `ai_assistant_id` | Implicit AI owner |
| Client overlay | `operational-store.assignment` | **Wins in UI** |

`getOwnerLabel()` prefers sessionStorage assignment over backend assignment.

**Duplication:** Dual ownership sources with client overlay overriding backend.

---

## Assignment Flow (Current)

| Action | Backend API | Client overlay |
|--------|-------------|----------------|
| Assign to user | `assignConversation` | Also writes sessionStorage |
| Assign to team/dept/queue/AI | **None** | sessionStorage only |
| Release to AI | `releaseConversation` | Clears overlay |
| Reassign | Same as assign | Overlay replace |
| Accept / Reject / Transfer | **None** | **None** |
| Bulk / Auto / Round-robin / Skills | **None** | **None** |

**Duplication:** Assignment exists in DB (`assigned_user_id`) and sessionStorage (`assignment`).

---

## Escalation Flow (Current)

```
UI Escalate button → escalation-dialog → setEscalation() → sessionStorage
```

No backend persistence. No acceptance workflow. No multi-level escalation state machine.

**Duplication:** Escalated queue filter reads sessionStorage flag, not DB state.

---

## Inbox Architecture

- **Route:** `/dashboard/omnichannel` (deduplicated from `/dashboard/inbox`)
- **Layout:** 4-panel resizable console (queues | list | thread | sidebar)
- **Data:** React Query caches keyed by `conversation-list`, `conversation-messages`
- **Filters:** Channel, search, handler mode, queue presets (client-side)

---

## Queue Architecture

Queues are **virtual filters** in `conversation-queues.ts`:

| Queue ID | Filter logic |
|----------|--------------|
| `unassigned` | No assigned agent, not closed |
| `mine` | Assigned to current user |
| `team` | Assigned to anyone |
| `waiting_customer` | `waiting_user` state |
| `waiting_ai` | AI handler mode |
| `escalated` | sessionStorage escalation flag |
| `closed_24h` | Closed within 24h |

**Duplication:** Queue membership is computed from mixed backend + overlay signals.

---

## Permissions (Current)

| Permission | Scope |
|------------|-------|
| `ai.conversations.view` | Console access |
| `ai.conversations.reply` | Send messages |
| `ai.conversations.takeover` | Assign / take over |
| `ai.conversations.release` | Release to AI |
| `channels.view` | Channel filter |
| `customers.view` | Customer enrichment |

No explicit Admin/Manager/Supervisor/Agent/AI Employee role matrix for lifecycle actions.

---

## AI Employee Interaction (Current)

- AI owns conversations when `handlerMode === "ai"` (no human assignee, non-transferred states)
- Human takeover: `assignConversation` + optional overlay
- Release: `releaseConversation` — **bypasses** state machine trigger `agent_release_to_ai` → `greeting` (uses default `waiting_user`)
- AI assist panel: client-side heuristics (`ai-assist-service.ts`), not lifecycle-driven
- No lifecycle participant abstraction

---

## CRM Interaction (Current)

- Customer enrichment via `useCustomersEnrichment`
- Sidebar CRM tabs: stub context (open tickets, bookings, invoices = 0)
- Create/Link Customer buttons exist in `customer-header.tsx` but handlers not wired from console

---

## Identified Duplications

| Concern | Location A | Location B | Conflict |
|---------|-----------|-----------|----------|
| Conversation status | DB `state` | UI `handlerMode` + queue filters | No single lifecycle |
| Ownership | `assigned_user_id` | sessionStorage `assignment` | Overlay wins |
| Assignment | Backend assign API | sessionStorage | Team/queue/AI UI-only |
| Queues | Virtual filters | Escalation overlay flag | Not routing entities |
| Escalation | None (backend) | sessionStorage | Not persistent |
| Escalation logic | Queue filter | Dialog + overlay | Button-based, no engine |
| Internal notes | Saved via API | Filtered out in `message-thread` | Hidden from agents |
| Release-to-AI | `releaseConversation` | State machine `agent_release_to_ai` | Different target states |

---

## P0 Issues (Lifecycle Sprint Must Address Architecturally)

1. Escalation — sessionStorage only
2. Assignment to team/dept/queue/AI — no API, overlay only
3. Dual ownership — overlay overrides backend
4. Release to AI — bypasses declarative state machine
5. No unified timeline for lifecycle events
6. No permission matrix for enterprise roles
7. AI employee not a formal lifecycle participant

---

## Remediation Strategy (Sprint 9.1)

Build additive `conversation-lifecycle` module as **single source of truth** for:

- Lifecycle states (mapped from backend + metadata overlay)
- Transition validation
- Ownership resolution (one canonical owner)
- Assignment with history
- Escalation state machine
- Presence model
- Timeline events
- Header projection
- Role-based permissions
- AI participant actions

Existing UI and runtime remain unchanged; future UI consumes lifecycle engines via coordinator.
