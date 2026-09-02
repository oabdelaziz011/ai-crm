# Human Handoff Platform — Architecture

Enterprise orchestration layer between AI Employees and Human Agents. Follows the Ticket Platform golden template.

## Read Path

```
Consumer → HandoffReadPort → HandoffQueryService (RBAC + cache) → HandoffRepository → DB/RPC
```

## Write Path

```
Consumer → HandoffCommandService → HandoffRepository
                                  → HandoffConversationPort (ai-conversation — no duplication)
                                  → ContextAssemblyPort / NotificationPort / EventPublisherPort / AuditPort
```

## Ownership Model

Every conversation has exactly one owner at all times:

| Owner Type | Description |
|------------|-------------|
| `ai_employee` | AI handling the conversation |
| `human_agent` | Assigned human agent |
| `queue` | Waiting in routing queue |
| `system` | Unassigned / system state |

Ownership transitions are persisted in `handoff_ownership_history`.

## Queue Engine

Routing strategies: round robin, least busy, skills based, department based, priority based, VIP routing, language routing.

Supports overflow queues, max queue size, business hours, estimated wait time, and queue position.

## Escalation Engine

Configurable triggers: low confidence, customer requested, sensitive topic, billing, complaint, repeated failures, policy violation, manual.

## Context Transfer

On transfer/escalation, `handoff_context_snapshots` stores:

- Conversation history
- Customer profile / Customer360
- Memory, knowledge, tools used
- Open tickets, appointments, workflow state
- Runtime metadata

## Events

| Domain Event | Workflow Event |
|--------------|----------------|
| `conversation_transferred` | `conversation.transferred` |
| `conversation_accepted` | `conversation.accepted` |
| `conversation_escalated` | `conversation.escalated` |
| `conversation_returned_to_ai` | `conversation.returned_to_ai` |
| `queue_joined` | `conversation.queue_joined` |
| `owner_changed` | `conversation.owner_changed` |

## Inbound AI Gate

When a conversation is human-owned, queued, paused, or transferred, the channel inbound pipeline must **not** run AI Employee replies or sticky automation.

| Component | Location |
|-----------|----------|
| Pure decision | `evaluateInboundAiGate` — `src/services/inbound-ai-gate.ts` |
| Supabase port | `createSupabaseInboundAiGatePort` — `src/adapters/supabase-inbound-ai-gate.ts` |
| Channel wiring | `ChannelPlatformPorts.inboundAutomationGate` |
| Pipeline enforcement | `InboundMessagePipeline.resolveInboundAutomationGate` |

Webhook platform wires the gate in `artifacts/api-server/src/platform/create-webhook-platform.ts`.

## Wiring (login-app)

| Component | File |
|-----------|------|
| Platform factory | `artifacts/login-app/src/lib/human-handoff-platform/handoff-platform-factory.ts` |
| Conversation port | `handoff-conversation-port-adapter.ts` |
| Context assembly | `handoff-context-assembly-adapter.ts` |
| Lifecycle bridge | `handoff-lifecycle-bridge.ts` |
| REST gateway | `integration-api-gateway-service.ts` |

## Database

Migration `217_human_handoff_platform_sprint6_10.sql`:

- `handoff_queues`, `handoff_queue_members`
- `handoff_conversation_ownership`, `handoff_ownership_history`
- `handoff_requests`, `handoff_context_snapshots`
- `agent_presence`, `handoff_escalation_rules`
- RPC: `handoff_platform_company_metrics_v1`

## Repository Visibility

Repositories are internal to `@workspace/human-handoff-platform`. External consumers use `HandoffCommandService`, `HandoffQueryService`, or `HandoffReadPort` only.
