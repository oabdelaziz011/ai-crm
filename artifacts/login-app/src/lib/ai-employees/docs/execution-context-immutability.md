# AI Employee Execution Context — Immutability on Unpublish

## Summary

When an AI Employee is bound to a runtime execution (agent workflow or Floating AI chat),
an immutable `AgentEmployeeExecutionContext` is created **once** and attached to
`pageContext.employeeExecutionContext`.

## Behavior when an employee is unpublished mid-execution

| Situation | Behavior |
|-----------|----------|
| Workflow already running with frozen context | Continues with original tool scope, provider, and knowledge config |
| Resume / recover same workflow | Reuses the same frozen context object — no re-resolve |
| New workflow start after unpublish | Binding fails; no ExecutionContext created |
| Floating AI chat with stored conversation context | Reuses stored context — no re-resolve |
| New chat conversation after unpublish | Binding fails if employee is draft/unpublished |

## Rationale

- Prevents mid-flight scope expansion or provider switching when governance changes.
- Matches enterprise expectation: in-progress work completes under the rules active at start.
- New sessions always reflect current publish state via `resolveEmployeeChannelRuntime`.

## Storage locations

- **Workflows:** `memory.executionState.pageContext.employeeExecutionContext`
- **Floating AI chat:** in-memory conversation store + sessionStorage employee binding key
- **Tool scope:** conversation-scoped registry keyed by `conversationId`

## Related modules

- `agent-employee-execution-context.ts` — context creation and reads
- `prepare-employee-chat-runtime.ts` — chat binding path
- `resolve-employee-channel-runtime.ts` — one-time binding resolution
- `tool-scope-context.ts` — conversation tool scope registry
