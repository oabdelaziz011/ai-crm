# Sprint AI-Agents Foundation — Enterprise Agent Runtime

Production-quality agent layer extending the existing AI Runtime without architectural redesign.

## Architecture

The agent layer sits **above** the existing pipeline:

```
User Goal
    ↓
Agent Planner          (lib/agent-runtime/src/planner/)
    ↓
Execution Plan / Task Graph   (lib/agent-runtime/src/task-graph/)
    ↓
Agent Execution Engine        (lib/agent-runtime/src/executor/)
    ↓
Execution Queue (dependency-aware batches)
    ↓
Tool Router / Runtime Chat    (existing — triggeredBy: "agent")
    ↓
Verification                  (lib/agent-runtime/src/verification/)
    ↓
Checkpoints + Memory          (lib/agent-runtime/src/checkpoint/, memory/)
    ↓
Final Report + Events         (lib/agent-runtime/src/events/)
```

**Unchanged:** Runtime, Prompt Orchestrator, Tool Router, Knowledge, Providers, Observability, RBAC.

**Extended:** Floating AI Panel (Chat | Agent tabs), AI Operations Center (Agent Workflows tab).

## Package layout

```
lib/agent-runtime/
  planner/agent-planner.ts
  executor/agent-execution-engine.ts
  task-graph/task-graph.ts
  verification/verification-service.ts
  checkpoint/checkpoint-service.ts
  memory/agent-memory.ts
  events/agent-event-publisher.ts
  types.ts
  constants.ts
  index.ts
```

## Execution flow

1. User enters a goal in the **Agent** tab or uses `/agent <goal>` / natural-language agent patterns.
2. `AgentPlanner` matches goal templates (customer, booking, knowledge, invoice, parallel demo).
3. Task graph persisted to `agent_workflows` (migration 174).
4. `AgentExecutionEngine.runUntilBlocked()`:
   - Resolves runnable nodes (respects dependencies).
   - Parallelizes independent tasks via `getRunnableNodes()`.
   - Routes tool tasks through `ToolRouterService.route({ triggeredBy: "agent" })`.
   - Non-tool tasks use Runtime Chat port.
5. After each task: `VerificationService.verify()` — failure triggers retry or `waiting_user`.
6. Checkpoints saved after each batch to `agent_workflow_checkpoints`.
7. Events appended to `agent_workflow_events` and emitted to UI subscribers.
8. On completion: `final_report` generated and `WorkflowCompleted` event published.

## Task graph examples

### Sequential (create customer)

```
Validate details → Create customer → Generate report
```

### Parallel + merge

```
        ┌─ Lookup customer ─┐
Start ──┤                   ├── Confirm schedule
        └─ Check availability ┘
```

### Conditional edges

Edges support `on_success`, `on_failure`, `always` conditions and `rollbackMarker` flags.

## Recovery examples

| Scenario | Behavior |
|----------|----------|
| Transient tool failure | Retry up to `maxRetries` with backoff |
| Verification failed (recoverable) | Retry task |
| Verification failed (exhausted) | Status → `waiting_user`, pause workflow |
| User navigates away | Workflow continues; checkpoint on next batch |
| Panel minimized | `sessionStorage` stores active workflow id; resume on return |
| User clicks Resume | `AgentRuntimeService.resume()` continues from checkpoint |

Failures are **never silently ignored** — UI shows paused state and error message.

## Verification rules

Post-task checks include:

- `customer_exists` — create customer output validated
- `lookup_has_results` — CRM lookup returned data
- `booking_created` — booking tool succeeded
- `provider_accepted` — email/provider acceptance
- `results_exist` — knowledge search returned hits

## Security

- Every workflow row is tenant-scoped (`company_id`, RLS).
- `runtime.execute` permission required to start/resume.
- Super-admin ops RPC `platform_ai_ops_agent_workflows()` for cross-tenant monitoring.
- Tool Router inherits existing RBAC per tool definition.

## UI

**Floating AI Panel → Agent tab**

- Task graph with status icons
- Progress bar
- Timeline (runtime events)
- Final report
- Resume when paused

**AI Operations Center → Agent Workflows tab**

- Cross-tenant workflow list with progress, status, correlation id

## Database (migration 174)

- `agent_workflows`
- `agent_workflow_checkpoints`
- `agent_workflow_events`
- RPC: `platform_ai_ops_agent_workflows`

## Production readiness checklist

- [x] Agent package with planner, executor, verification, checkpoints, events
- [x] Supabase persistence + RLS
- [x] Tool Router integration (`triggeredBy: "agent"`)
- [x] Floating AI Agent tab
- [x] Ops center agent workflows monitor
- [x] Background task telemetry (`platform_ai_background_tasks`)
- [ ] Apply migration 174 to production Supabase
- [ ] E2E browser verification with live tools
- [ ] Arabic locales for agent UI

## Browser verification

1. Log in as `demo-alpha-admin@vaultos.local`
2. Open Floating AI (Ctrl+K)
3. Switch to **Agent** tab
4. Enter: `Create a new customer named Acme Corp`
5. Observe: Planning → task graph → task execution → timeline events
6. Super-admin: `/dashboard/platform/ai-operations` → **Agent Workflows** tab

## Comparable capabilities

Aligned with enterprise agent runtimes (Copilot Actions, OpenAI Agents, LangGraph, Temporal):

- Planning with dependency graphs
- Parallel execution
- Verification gates
- Retry / pause / resume
- Checkpoints
- Observability feed
- Tenant isolation
