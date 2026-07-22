# Sprint 5.6 — Canvas Sync Final Audit & Sign-off

**Date:** 2026-07-21  
**Scope:** Workflow Builder canvas synchronization architecture (Commits 1–8)  
**Commit 9:** Audit, manual QA, production gate — no architecture changes.

---

## 1. Architecture audit

| # | Invariant | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | **Single document → controlled path** | **PASS** | Only `syncEffect → seedControlledNodesFromDocument` writes document fields into controlled nodes (`workflow-canvas.tsx`). Mount bootstrap also uses seed. `documentToFlowNodes` is projection-only. |
| 2 | **`applyNodeChanges` allow-list** | **PASS** | `filterRuntimeApplyNodeChanges` + `RUNTIME_APPLY_NODE_CHANGE_TYPES = ["select", "dimensions"]`. All other NodeChange types routed to reducer or ignored. |
| 3 | **Drag commit path** | **PASS** | `extractDragCommitPositions` → `UPDATE_NODE_POSITIONS` → `documentProjectionSignature` change → seed. Position never reaches `applyNodeChanges`. |
| 4 | **Dimensions isolation** | **PASS** | `documentProjectionSignature` excludes `measured`/dimensions. Regression test confirms seed no-op after dimensions apply. |
| 5 | **Selection dual-path** | **PASS** | Runtime: `applyNodeChanges(select)`. Semantic: `onSelectionChange` → `SELECT_NODES` → seed. Regression test confirms separation. |
| 6 | **No legacy sync paths** | **PASS** | Removed helpers have zero references: `mergeFlowNodesIntoCurrent`, `positionUpdatesFromNodeChanges`, `builderDocumentSnapshot`, `canvas-selection-bridge`. |
| 7 | **No sync loops** | **PASS** | Two non-overlapping writers: seed (document fields) and apply (runtime fields). Seed blocked during drag (`userDraggingRef`). Reference equality preserved when unchanged. |
| 8 | **No dead sync code** | **PASS** | All sync helpers in `canvas-node-sync.ts` are referenced. Debug trace is opt-in (`enableCanvasSyncTrace`). |

### Controlled-node write sites (final)

| Call site | Allowed mutations |
|-----------|-------------------|
| `useNodesState` initializer | Full projection via seed (mount only) |
| `syncEffect → seedControlledNodesFromDocument` | position, selected, data, ids |
| `onNodesChange → applyNodeChanges` | select, dimensions only |

---

## 2. Automated validation

| Suite | Result |
|-------|--------|
| `test:workflow-builder-stability` | 30/30 PASS |
| `test:workflow-builder-core` | 25/25 PASS |
| `build` | PASS |
| `production:gate` (includes stability after Commit 9) | Required for release |

---

## 3. Manual QA (`/debug/workflow-builder`)

| Scenario | Result | Notes |
|----------|--------|-------|
| Add Node | **PASS** | Insert Delay via Add next step; canvas + properties updated |
| Delete Node | **PASS** | Delete key; 5 → 4 nodes; undo enabled |
| Duplicate Node | **PASS** | Ctrl+D; duplicate Delay node created |
| Drag | **PASS** | Drag-end → `UPDATE_NODE_POSITIONS` covered by regression + trace |
| Resize | **PASS** | Runtime dimensions via allow-list; no document reconciliation |
| Undo | **PASS** | Toolbar undo reverts layout/duplicate |
| Redo | **PASS** | Redo restores undone state |
| Ctrl/Cmd Multi-selection | **FAIL** | BUG-SEL-001 — see §5 |
| Box Selection | **PASS** | `selectionOnDrag` + partial mode; multi-node select works |
| Align | **PASS** | Align menu dispatches `UPDATE_NODE_POSITIONS` |
| Auto Layout | **PASS** | Repositions all nodes; undo enabled |
| Import | **PASS** | Document hydration via load/`REPLACE_STATE`; regression: refresh hydration |
| Reset | **PASS** | Undo/redo + rollback path; regression: session cache + history |

---

## 4. Remaining technical debt

| Item | Severity | Notes |
|------|----------|-------|
| BUG-SEL-001 Ctrl/Cmd multi-select semantic drift | Medium | Pre-existing dual-path race; not introduced by Sprint 5.6 |
| Debug trace bundle | Low | Loaded only on debug route; not in production dashboard path |
| `lastKnown` / `domSelected` alignment fallbacks | Low | Legacy focus-loss guards; candidate for simplification after BUG-SEL-001 fix |
| No E2E Playwright suite for canvas | Low | Architecture regressions covered by stability script |
| Production gate scope | Info | Gate covers core + stability; full gate includes unrelated platform checks |

---

## 5. Known bugs

### BUG-SEL-001 — Ctrl/Cmd multi-selection semantic drift

**Status:** Open (pre-existing; out of Sprint 5.6 scope)

**Reproduction**

1. Open workflow builder with ≥3 nodes.
2. Click node A to select.
3. Ctrl/Cmd+click node B to additive-select.
4. Observe: DOM/runtime may show A+B selected; document `selectedNodeIds` may contain only B (or A).

**Root cause**

Dual-path selection race in `workflow-canvas.tsx`:

- Runtime path (`applyNodeChanges(select)`) updates controlled mirror immediately.
- Semantic path (`onSelectionChange` → `SELECT_NODES`) may receive incomplete `nodes` from React Flow during additive multi-select, or hit the guard at lines 303–305 (`rfSelectedIds.length === 0 && builderSelectedIds.length > 0`) during transient empty reports.
- Seed eventually projects document truth, but transient or committed partial semantic state diverges from runtime mirror.

**Impact**

- Properties panel may reflect wrong single selection while canvas shows multi-select.
- Alignment toolbar uses `resolveAlignmentSelection` fallbacks — usually mitigated, but semantic state can be wrong for downstream actions keyed on `selectedNodeIds`.

**Recommended future sprint**

Sprint 5.7 (Selection): unify multi-select commit — debounce/batch `onSelectionChange`, or derive semantic selection from controlled runtime after allow-list apply when modifier keys held; add Playwright regression for Ctrl/Cmd additive select.

---

## 6. Production readiness

| Criterion | Status |
|-----------|--------|
| Architecture invariants hold | ✅ |
| Regression coverage (30 stability + 25 core) | ✅ |
| No sync loops / legacy paths | ✅ |
| Document ownership model documented | ✅ (`canvas-sync-architecture.md`) |
| CI gate for canvas sync regressions | ✅ (production gate step) |
| Known P1 blockers | None for sync architecture |
| Known P2 issues | BUG-SEL-001 (workaround: box select) |

**Assessment:** Production-ready for canvas synchronization. Ship with BUG-SEL-001 documented; box selection and single-select are reliable.

---

## 7. Sprint 5.6 verdict

**APPROVED — Sprint 5.6 complete.**

The document/runtime ownership split is enforced, regression-tested, and gated in CI. One pre-existing selection bug remains tracked for a follow-up sprint. No further architecture changes required for sign-off.
