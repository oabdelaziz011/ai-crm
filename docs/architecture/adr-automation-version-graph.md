# ADR: Immutable Automation Version Graph for Runtime Execution

**Status:** Accepted  
**Date:** 2026-07-24  
**Context:** Sprint B2 / production workflow engine hardening

## Problem

The workflow builder stores draft graphs in mutable tables (`automation_nodes`, `automation_edges`). Each draft save deletes and recreates nodes with **new UUIDs**. Published snapshots retain the original node IDs.

Runtime execution loaded graphs from published snapshots but persisted `current_node_id` with foreign keys to mutable draft nodes. After a draft save, snapshot node IDs no longer existed in `automation_nodes`, causing FK violations (PostgreSQL `23503`) and stranded runs/sessions.

## Decision

Introduce **materialized, immutable version-scoped graph tables** and pin all runtime state to `(flow_version_id, current_node_id)`.

| Layer | Tables | Mutability |
|-------|--------|------------|
| Draft (builder) | `automation_nodes`, `automation_edges` | Mutable; recreated on save |
| Published version | `automation_flow_versions.snapshot` | Immutable JSON archive |
| Runtime graph | `automation_flow_version_nodes`, `automation_flow_version_edges` | Insert-only after publish |
| Runtime state | `automation_runs`, `conversation_sessions` | Pinned to one `flow_version_id` |

### Why version graph tables exist

1. **Referential integrity** — PostgreSQL composite FKs require target rows to exist. Snapshot JSON alone cannot be referenced by FK.
2. **Query performance** — Runtime loads only `WHERE flow_version_id = $1`; no draft table scans.
3. **Immutability enforcement** — DB triggers block UPDATE/DELETE on published graphs.
4. **Auditability** — Each published version has a queryable, versioned graph independent of draft edits.

### Why runtime references version nodes

- `automation_runs.flow_version_id` + `current_node_id` → `automation_flow_version_nodes(flow_version_id, id)`
- `conversation_sessions.flow_version_id` + `current_node_id` → same composite FK
- Resume, waiting states, retries, and variable persistence all inherit the run/session pin

Draft nodes must never be referenced at runtime because:

- Draft UUIDs change on every builder save
- Draft graphs may be incomplete or invalid while editing
- Unpublishing or republishing must not affect in-flight executions

## Publish Flow (Atomic)

Publishing executes inside a single PostgreSQL transaction via `publish_automation_workflow_version()`:

1. Create new `automation_flow_versions` row (new version number)
2. Materialize nodes/edges into version graph tables
3. Set `is_active` on the new version; deactivate prior active version
4. Update `automation_flows.active_version_id`, `version`, `status`

If materialization fails at any step, the entire transaction rolls back. `active_version_id` remains unchanged and no partial version graph persists.

Application code calls this through `WorkflowPublishTransactionRepository.publishAtomically()`.

## Runtime Execution

`AutomationEngine.start()` and `resume()`:

1. Resolve pinned `flow_version_id` (from run/session for resume; from `active_version_id` for new starts)
2. Load graph via `versionGraph.listExecutionGraph(flowVersionId)` — **never** from draft tables
3. Fall back to version snapshot JSON only when graph rows are missing (legacy backfill gap)

Resume does **not** require the flow to remain `active`. It depends solely on the pinned version graph.

## Migration Strategy

Migration `139_automation_version_graph.sql`:

1. Create version graph tables (idempotent `IF NOT EXISTS`)
2. Add `flow_version_id` to runs and sessions
3. Backfill graph rows from existing published snapshots
4. Backfill `flow_version_id` from `active_version_id` / run metadata
5. Validate orphan references before applying composite FKs
6. Repoint FKs from `automation_nodes` → version graph nodes

Migration `140_automation_version_graph_hardening.sql`:

1. Immutability triggers on version graph tables
2. CHECK constraints: `current_node_id` requires `flow_version_id`
3. Pre-FK validation DO block (idempotent re-run safety)
4. Atomic publish RPC

Post-migration validation: `supabase/scripts/validate_version_graph_migration.sql`

## Rollback Strategy

| Scenario | Behavior |
|----------|----------|
| Failed publish (mid-transaction) | Full rollback; no partial graph |
| Workflow rollback (activate prior version) | New executions use prior version; in-flight runs keep their pin |
| Migration failure | DO block raises before FK switch; prior constraints preserved |
| Builder crash during draft edit | No effect on pinned runtime state |

## Future Maintenance

- **Scheduled jobs / timers / retries (future):** When added, every queue row must include `flow_version_id` and reference version graph nodes, never draft nodes.
- **Version graph growth:** Graphs are append-only per publish. Archive old versions via lifecycle policies; do not DELETE rows referenced by historical runs.
- **Snapshot vs graph drift:** Publish materialization is the source of truth. Snapshot JSON is an archive; graph tables power runtime FKs and queries.
- **Draft save behavior:** Continue regenerating draft UUIDs. Runtime isolation depends on version pinning, not draft UUID stability.

## Consequences

**Positive**

- Long-running conversations survive draft edits, unpublish, and republish
- Strict FK integrity without weakening constraints
- Concurrent executions on different published versions are isolated
- Publish failures cannot leave partial version graphs

**Negative**

- Additional storage per published version (nodes + edges rows)
- Publish path must succeed atomically (stricter failure handling)
- Backfill migration required for existing installations

## Verification

- Unit/regression: `pnpm --dir lib/automation-platform test`
- Migration validation: run `validate_version_graph_migration.sql` after applying 139 + 140
- E2E: `pnpm --dir artifacts/login-app version-graph:whatsapp:e2e`
