# Sprint 9.2 — Integration Audit (Pre-Change)

## Components Using Legacy State

| File | Legacy Pattern | Replacement |
|------|----------------|-------------|
| `omnichannel-console.tsx` | sessionStorage via operational-store | `ConversationLifecycleCoordinator.snapshot()` |
| `omnichannel-console.tsx` | `getOwnerLabel()` from sessionStorage | `snapshot.owner.label` |
| `omnichannel-console.tsx` | `operationalTick` state bump | React Query invalidation after metadata persist |
| `omnichannel-console.tsx` | Direct `assign/release/close` mutations | `transition()` via lifecycle actions hook |
| `omnichannel-console.tsx` | `isConversationEscalated(id)` sessionStorage | `snapshot.activeEscalation` from metadata |
| `omnichannel-console.tsx` | `setConversationAssignment()` sessionStorage | `AssignmentEngine` + metadata persist |
| `omnichannel-console.tsx` | `escalateConversation()` sessionStorage | `EscalationEngine` + metadata persist |
| `omnichannel-console.tsx` | `handlerMode === "ai"` stats | `lifecycleState === "AI_HANDLING"` |
| `conversation-queues.ts` | `isConversationEscalated(item.id)` | `item.isEscalated` from aggregator |
| `conversation-queues.ts` | `handlerMode` filters | `lifecycleState` filters |
| `workspace-sidebar.tsx` | operational assignment/escalations props | lifecycle snapshot props |
| `workspace-sidebar.tsx` | `assignment?.targetLabel` ownership | `snapshot.owner.label` |
| `workspace-sidebar.tsx` | stub `context.timelinePreview` | `snapshot.timeline` |
| `escalation-dialog.tsx` | imports from operational-store | lifecycle escalation types |
| `conversation-aggregator.ts` | `resolveHandlerMode()` duplicated | derive from lifecycle state |
| `customer-header.tsx` | raw `conversation.status`, `handlerMode` | lifecycle header model |
| `conversation-item.tsx` | `handlerMode === "ai"` | `lifecycleState` |
| `message-thread.tsx` | filters out internal notes in `groupMessages` | permission-gated display |
| `conversation-view.tsx` | no create/link customer handlers | wired customer link flow |
| `conversation-operational-store.ts` | sessionStorage | **deprecated** — metadata.lifecycle only |

## Duplicated State Summary

| Concern | Before | After |
|---------|--------|-------|
| Ownership | sessionStorage + backend | `metadata.lifecycle.owner` |
| Assignment | sessionStorage + partial API | `AssignmentEngine` history in metadata |
| Escalation | sessionStorage | `EscalationEngine` in metadata |
| Status | backend `state` string in UI | `lifecycleState` from coordinator |
| Handler mode | aggregator heuristic | derived from lifecycle state |
| Queue membership | sessionStorage escalation flag | metadata escalation status |
| Timeline | CRM stub | unified lifecycle timeline |
| Internal notes | filtered from thread | permission-gated, timeline events |

## Out of Scope (unchanged)

- `inbox-navigation.ts` sessionStorage (focus routing, not lifecycle)
- AI chat workspace sessionStorage
- Workflow builder sessionStorage
