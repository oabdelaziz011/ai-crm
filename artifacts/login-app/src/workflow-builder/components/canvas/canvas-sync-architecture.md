# Workflow Builder — Canvas Synchronization Architecture

Sprint 5.6 final ownership model. Implementation lives in `canvas-node-sync.ts` and
`workflow-canvas.tsx`.

## Runtime owns (controlled mirror)

| Field | Path |
|-------|------|
| `nodes[].selected` | `handleNodesChange` → `filterControlledMirrorNodeChanges` → `applyNodeChanges(select)` |
| `measured`, `width`, `height` | `applyNodeChanges(dimensions)` |
| Transient drag position | `applyNodeChanges(position)` during drag (mirror only) |

## Document owns

| Concern | Reducer actions | Reconciliation |
|---------|-----------------|----------------|
| Committed position | `UPDATE_NODE_POSITIONS` (drag end) | seed |
| Node lifecycle (add/delete/duplicate) | `ADD_NODE`, `DELETE_NODES`, `DUPLICATE_NODES`, … | seed |
| Node data / labels | `UPDATE_NODE_CONFIG`, i18n projection | seed |
| Semantic selection | `SELECT_NODES` | seed |
| History | undo / redo | seed |

## Synchronization

```
Document reducer
    ↓ documentToFlowNodes
Flow-node projection
    ↓ seedControlledNodesFromDocument     ← sole document → controlled path
Controlled nodes
    ↓ nodes prop
React Flow store (StoreUpdater)
```

**Bounded seed trigger:** `documentProjectionSignature` — changes when document
projection changes; never when only runtime dimensions change. During drag the
document is unchanged, so seed does not run until drag-end commit.

**Controlled mirror allow-list:** `select`, `dimensions`, and transient `position`
(`filterControlledMirrorNodeChanges`).

**Drag commit:** mirror apply during drag → `extractDragCommitPositions` on drag end
→ `UPDATE_NODE_POSITIONS` → seed (idempotent when mirror already matches).

**Selection dual-path:**

1. Mirror — `applyNodeChanges(select)` closes RF controlled-mode loop.
2. Semantic — `handleNodesChange` / `onSelectionChange` → `SELECT_NODES` commits document truth.
3. Reconcile — seed projects `selectedNodeIds` into controlled nodes (idempotent when aligned).

## Invariants (regression-tested)

- Document → controlled nodes **only** through `seedControlledNodesFromDocument`.
- Transient position updates reach `applyNodeChanges` (controlled mirror) but **not** the document until drag end.
- Drag-end positions commit **only** via `UPDATE_NODE_POSITIONS`.
- Runtime dimensions **do not** change `documentProjectionSignature`.
- After add / delete / duplicate / move / undo / redo, seed produces controlled nodes
  matching the document projection.

## Sprint sign-off

Final audit, manual QA, and production gate: `sprint-5.6-sign-off.md` (Commit 9).
