import type { Node, NodeChange } from "@xyflow/react";
import type { WorkflowNodeData } from "../components/nodes/workflow-node-card";

export type CanvasSyncTraceKind =
  | "setNodes"
  | "onNodesChange"
  | "handleNodesChange"
  | "seedControlledNodesFromDocument"
  | "syncEffect"
  | "storeUpdaterProp"
  | "nodesPropRender"
  | "pointer";

export type CanvasSyncTraceEntry = {
  timestamp: number;
  seq: number;
  kind: CanvasSyncTraceKind;
  caller: string;
  reason: string;
  nodeCount: number;
  changed: boolean;
  referenceChanged: boolean;
  detail?: string;
  changeTypes?: string[];
  dragging?: boolean | null;
  meta?: Record<string, unknown>;
};

declare global {
  interface Window {
    __WB_CANVAS_SYNC_LOGS__?: CanvasSyncTraceEntry[];
    __WB_CANVAS_SYNC_DUMP__?: () => CanvasSyncTraceEntry[];
    __WB_CANVAS_SYNC_SUMMARY__?: () => Record<string, number>;
    __WB_CANVAS_SYNC_LAST__?: () => CanvasSyncTraceEntry | undefined;
    __WB_CANVAS_SYNC_TAIL__?: (n?: number) => CanvasSyncTraceEntry[];
  }
}

let seq = 0;
let pointerPhase: "idle" | "down" | "move" = "idle";

function ensureStore(): CanvasSyncTraceEntry[] {
  if (typeof window === "undefined") return [];
  if (!window.__WB_CANVAS_SYNC_LOGS__) {
    window.__WB_CANVAS_SYNC_LOGS__ = [];
    window.__WB_CANVAS_SYNC_DUMP__ = () => [...(window.__WB_CANVAS_SYNC_LOGS__ ?? [])];
    window.__WB_CANVAS_SYNC_LAST__ = () => {
      const logs = window.__WB_CANVAS_SYNC_LOGS__ ?? [];
      return logs[logs.length - 1];
    };
    window.__WB_CANVAS_SYNC_TAIL__ = (n = 30) => {
      const logs = window.__WB_CANVAS_SYNC_LOGS__ ?? [];
      return logs.slice(-n);
    };
    window.__WB_CANVAS_SYNC_SUMMARY__ = () => {
      const counts: Record<string, number> = {};
      for (const entry of window.__WB_CANVAS_SYNC_LOGS__ ?? []) {
        const key = `${entry.kind}:${entry.caller}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    };
  }
  return window.__WB_CANVAS_SYNC_LOGS__;
}

function push(entry: Omit<CanvasSyncTraceEntry, "timestamp" | "seq">) {
  const full: CanvasSyncTraceEntry = {
    timestamp: Date.now(),
    seq: ++seq,
    ...entry,
  };
  if (typeof window !== "undefined") {
    ensureStore().push(full);
  }
  const dragPart = full.dragging == null ? "" : ` dragging=${String(full.dragging)}`;
  const typesPart = full.changeTypes?.length ? ` types=[${full.changeTypes.join(",")}]` : "";
  console.log(
    `[CANVAS-TRACE #${full.seq}] ${full.kind} caller=${full.caller} reason=${full.reason} count=${full.nodeCount} changed=${full.changed} refChanged=${full.referenceChanged}${dragPart}${typesPart}${full.detail ? ` detail=${full.detail}` : ""}`,
    full.meta ?? "",
  );
  return full;
}

type NodeLike = Node<WorkflowNodeData>;

export function compareRfNodeArrays(
  before: NodeLike[] | undefined,
  after: NodeLike[] | undefined,
): { changed: boolean; referenceChanged: boolean; detail: string } {
  if (before === after) {
    return { changed: false, referenceChanged: false, detail: "same array reference" };
  }
  if (!before || !after) {
    return {
      changed: true,
      referenceChanged: true,
      detail: `null transition before=${before?.length ?? 0} after=${after?.length ?? 0}`,
    };
  }
  if (before.length !== after.length) {
    return {
      changed: true,
      referenceChanged: true,
      detail: `length ${before.length} -> ${after.length}`,
    };
  }

  const semantic: string[] = [];

  for (let i = 0; i < after.length; i++) {
    const prev = before[i];
    const next = after[i];
    if (!prev || !next) {
      semantic.push(`index ${i} missing node`);
      continue;
    }
    if (prev.id !== next.id) {
      semantic.push(`index ${i} id ${prev.id} -> ${next.id}`);
    }
    if (prev.position.x !== next.position.x || prev.position.y !== next.position.y) {
      semantic.push(`${next.id} position`);
    }
    if (prev.selected !== next.selected) {
      semantic.push(`${next.id} selected`);
    }
    if (prev.width !== next.width || prev.height !== next.height) {
      semantic.push(`${next.id} dimensions`);
    }
    if (prev.measured?.width !== next.measured?.width || prev.measured?.height !== next.measured?.height) {
      semantic.push(`${next.id} measured`);
    }
  }

  if (semantic.length > 0) {
    return {
      changed: true,
      referenceChanged: true,
      detail: semantic.slice(0, 8).join(", "),
    };
  }
  return { changed: false, referenceChanged: before !== after, detail: "no semantic diff" };
}

export function summarizeNodeChanges(changes: NodeChange[]): string[] {
  return changes.map((change) => {
    if (change.type === "position") {
      return `position:${change.id}${change.dragging ? ":dragging" : ""}`;
    }
    if (change.type === "dimensions") return `dimensions:${change.id}`;
    if (change.type === "select") return `select:${change.id}:${change.selected}`;
    if (change.type === "remove") return `remove:${change.id}`;
    if (change.type === "add") return `add:${"id" in change ? change.id : "?"}`;
    if (change.type === "replace") return `replace:${change.id}`;
    return change.type;
  });
}

export function hasDraggingFlag(changes: NodeChange[]): boolean | null {
  const positions = changes.filter((change) => change.type === "position");
  if (positions.length === 0) return null;
  return positions.some((change) => change.type === "position" && change.dragging === true);
}

export function tracePointer(event: string, meta?: Record<string, unknown>) {
  if (event === "mousedown") pointerPhase = "down";
  if (event === "pointermove") pointerPhase = "move";
  push({
    kind: "pointer",
    caller: "window",
    reason: `${event} phase=${pointerPhase}`,
    nodeCount: 0,
    changed: true,
    referenceChanged: false,
    meta,
  });
}

export function traceHandleNodesChange(
  reason: string,
  changes: NodeChange[],
  nodeCount: number,
  meta?: Record<string, unknown>,
) {
  push({
    kind: "handleNodesChange",
    caller: "workflow-canvas.tsx",
    reason,
    nodeCount,
    changed: changes.length > 0,
    referenceChanged: false,
    changeTypes: summarizeNodeChanges(changes),
    dragging: hasDraggingFlag(changes),
    detail: `batchSize=${changes.length}`,
    meta,
  });
}

export function traceOnNodesChange(
  caller: string,
  reason: string,
  changes: NodeChange[],
  nodeCountBefore: number,
  meta?: Record<string, unknown>,
) {
  push({
    kind: "onNodesChange",
    caller,
    reason,
    nodeCount: nodeCountBefore,
    changed: changes.length > 0,
    referenceChanged: changes.length > 0,
    changeTypes: summarizeNodeChanges(changes),
    dragging: hasDraggingFlag(changes),
    detail: `batchSize=${changes.length}`,
    meta,
  });
}

export function traceSetNodes(
  caller: string,
  reason: string,
  before: NodeLike[] | undefined,
  after: NodeLike[] | undefined,
  meta?: Record<string, unknown>,
) {
  const diff = compareRfNodeArrays(before, after);
  push({
    kind: "setNodes",
    caller,
    reason,
    nodeCount: after?.length ?? before?.length ?? 0,
    changed: diff.changed,
    referenceChanged: diff.referenceChanged,
    detail: diff.detail,
    meta,
  });
  return after;
}

export function traceSeedControlledNodesFromDocument(
  caller: string,
  reason: string,
  before: NodeLike[],
  flowNodes: NodeLike[],
  after: NodeLike[],
) {
  const diff = compareRfNodeArrays(before, after);
  push({
    kind: "seedControlledNodesFromDocument",
    caller,
    reason,
    nodeCount: after.length,
    changed: diff.changed,
    referenceChanged: diff.referenceChanged,
    detail: diff.detail,
    meta: { flowNodeCount: flowNodes.length, returnedSameRef: before === after },
  });
  return after;
}

export function traceSyncEffect(
  reason: string,
  nodeCount: number,
  skipped: boolean,
  meta?: Record<string, unknown>,
) {
  push({
    kind: "syncEffect",
    caller: "workflow-canvas.tsx:useEffect",
    reason: skipped ? `SKIPPED: ${reason}` : reason,
    nodeCount,
    changed: !skipped,
    referenceChanged: !skipped,
    meta,
  });
}

/** Correlates with React Flow StoreUpdater — fires when nodes prop reference changes post-render. */
export function traceStoreUpdaterProp(
  before: NodeLike[] | undefined,
  after: NodeLike[] | undefined,
  meta?: Record<string, unknown>,
) {
  const diff = compareRfNodeArrays(before, after);
  push({
    kind: "storeUpdaterProp",
    caller: "StoreUpdater(correlated)",
    reason: "nodes prop reference changed → StoreUpdater useEffect will call setNodes",
    nodeCount: after?.length ?? 0,
    changed: diff.changed,
    referenceChanged: diff.referenceChanged,
    detail: diff.detail,
    meta,
  });
}

export function traceNodesPropRender(
  renderCount: number,
  before: NodeLike[] | undefined,
  after: NodeLike[] | undefined,
) {
  const diff = compareRfNodeArrays(before, after);
  if (!diff.referenceChanged && renderCount > 1) return;
  push({
    kind: "nodesPropRender",
    caller: "WorkflowCanvasInner",
    reason: `render #${renderCount} nodes prop to <ReactFlow>`,
    nodeCount: after?.length ?? 0,
    changed: diff.changed,
    referenceChanged: diff.referenceChanged,
    detail: diff.detail,
  });
}

export function installCanvasSyncRuntimeTrace() {
  if (typeof window === "undefined") return () => undefined;
  if ((window as unknown as { __WB_CANVAS_TRACE_INSTALLED__?: boolean }).__WB_CANVAS_TRACE_INSTALLED__) {
    return () => undefined;
  }
  (window as unknown as { __WB_CANVAS_TRACE_INSTALLED__?: boolean }).__WB_CANVAS_TRACE_INSTALLED__ = true;

  ensureStore();

  const onMouseDown = (event: MouseEvent) => {
    tracePointer("mousedown", {
      target: (event.target as HTMLElement | null)?.className ?? "",
      x: event.clientX,
      y: event.clientY,
    });
  };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerPhase === "idle") return;
    tracePointer("pointermove", {
      x: event.clientX,
      y: event.clientY,
      buttons: event.buttons,
    });
  };
  const onMouseUp = () => {
    pointerPhase = "idle";
    tracePointer("mouseup", {});
  };

  window.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("mouseup", onMouseUp, true);

  const onError = (event: ErrorEvent) => {
    if (!event.message.includes("Maximum update depth")) return;
    const tail = window.__WB_CANVAS_SYNC_TAIL__?.(40) ?? [];
    console.error("[CANVAS-TRACE CRASH] Maximum update depth — last 40 entries:", tail);
    const lastSetNodes = [...(window.__WB_CANVAS_SYNC_LOGS__ ?? [])].reverse().find((e) => e.kind === "setNodes");
    console.error("[CANVAS-TRACE CRASH] LAST setNodes:", lastSetNodes);
  };
  window.addEventListener("error", onError);

  console.log("[CANVAS-TRACE] Runtime instrumentation installed. Dump: window.__WB_CANVAS_SYNC_DUMP__()");

  return () => {
    window.removeEventListener("mousedown", onMouseDown, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("mouseup", onMouseUp, true);
    window.removeEventListener("error", onError);
  };
}
