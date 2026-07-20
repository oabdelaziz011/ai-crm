# Sprint B2-04 — Enterprise Workflow Lifecycle & Version Management

## Summary

Sprint B2-04 introduces enterprise governance for the VaultOS Workflow Platform: immutable published versions, draft-safe editing, one-click rollback, version history, visual comparison, publish validation, audit trail hooks, and RBAC integration — all without redesigning the Automation Engine execution pipeline.

## Architecture

```
Workflow Builder UI
  ├─ Draft workspace (mutable automation_nodes / automation_edges)
  ├─ Publish dialog (validate → summary → release notes → publish)
  ├─ Version timeline + compare view + rollback
  └─ Unsaved draft protection

lib/automation-platform/src/lifecycle/
  ├─ WorkflowLifecycleService      — draft edits, archive, history
  ├─ WorkflowPublishService        — validation + immutable version snapshot
  ├─ WorkflowRollbackService       — activate prior version + restore draft
  ├─ WorkflowAuditService          — app-layer audit entries
  ├─ compare-service               — visual diff summaries
  ├─ publish-validation            — blocking publish checks
  ├─ AutomationFlowVersionRepository
  └─ loadExecutionGraph            — runtime resolves active published snapshot

Runtime (unchanged pipeline)
  Flow (status = active)
    → active_version_id
    → immutable snapshot nodes/edges
    → AutomationEngine.start / resume
```

## Lifecycle Model

| UI label   | DB status  | Execution |
|-----------|------------|-----------|
| Draft     | `draft`    | Never     |
| Published | `active`   | Active version only |
| Archived  | `archived` / `disabled` | Never |

Published workflows remain editable in the **draft workspace** without affecting production. `has_unpublished_draft` tracks pending changes.

## Versioning

Table: `automation_flow_versions`

Each publish creates:
- Incrementing `version_number`
- Immutable `snapshot` (nodes, edges, metadata, name, trigger)
- `release_notes`, `published_at`, `published_by`
- `is_active` flag (one active version per flow)

Rollback activates a previous immutable version and optionally restores the draft workspace from that snapshot.

## Permissions (RBAC)

Existing:
- `automation.view`, `automation.edit`, `automation.publish`, `automation.create`, `automation.delete`, `automation.execute`

Added:
- `automation.rollback`
- `automation.archive`

Mapped to spec aliases: `workflow.view`, `workflow.edit`, `workflow.publish`, `workflow.rollback`, `workflow.archive`.

## Audit Trail

DB triggers (migration 133): `flow_archived`, `flow_rolled_back`

App service records: `workflow_created`, `draft_saved`, `published`, `rolled_back`, `archived`

## Deliverables

- Workflow Lifecycle Service
- Version Repository (+ Supabase implementation)
- Publish Service
- Rollback Service
- Audit Service
- Publish Validation
- Version Compare Service
- Runtime active-version graph resolution
- Version History UI, Publish Dialog, Compare View, Status Badges, Draft Protection
- Migration `133_automation_workflow_versions.sql`
- Unit tests

## Tests

```bash
pnpm --dir lib/automation-platform test
pnpm --dir artifacts/login-app test:workflow-builder-core
```

## Success Criteria

Business users can:
- Build safely in Draft
- Publish with validation and release notes
- View immutable version history
- Roll back to any prior published version
- Continue editing via draft without interrupting production

Runtime executes the active published snapshot when `active_version_id` is set, with backward-compatible fallback to live draft graph for legacy flows.
