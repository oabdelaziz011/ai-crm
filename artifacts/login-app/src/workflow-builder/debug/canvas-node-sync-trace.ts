import type { Node, NodeChange } from "@xyflow/react";
import type { WorkflowNodeData } from "../components/nodes/workflow-node-card";

export type CanvasSyncTraceEntry = {
  timestamp: number;
  seq: number;
  kind: "setNodes" | "onNodesChange" | "documentToFlowNodes" | "syncEffect";
  caller: string;
  reason: string;
  nodeCount: number;
  changed: boolean;
  referenceChanged: boolean;
  detail?: string;
  meta?: Record<string, unknown>;
};

declare global {
  interface Window {
    __WB_CANVAS_SYNC_LOGS__?: CanvasSyncTraceEntry[];
    __WB_CANVAS_SYNC_DUMP__?: () => CanvasSyncTraceEntry[];
    __WB_CANVAS_SYNC_SUMMARY__?: () => Record<string, number>;
  }
}

let seq = 0;

function ensureStore(): CanvasSyncTraceEntry[] {
  if (typeof window === "undefined") return [];
  if (!window.__WB_CANVAS_SYNC_LOGS__) {
    window.__WB_CANVAS_SYNC_LOGS__ = [];
    window.__WB_CANVAS_SYNC_DUMP__ = () => [...(window.__WB_CANVAS_SYNC_LOGS__ ?? [])];
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
  console.log(
    `[CANVAS-SYNC ${full.seq}] ${full.kind} caller=${full.caller} reason=${full.reason} count=${full.nodeCount} changed=${full.changed} refChanged=${full.referenceChanged}${full.detail ? ` detail=${full.detail}` : ""}`,
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
  const referenceOnly: string[] = [];

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
      semantic.push(`${next.id} selected ${String(prev.selected)} -> ${String(next.selected)}`);
    }
    if (prev.width !== next.width || prev.height !== next.height) {
      semantic.push(`${next.id} dimensions`);
    }
    if (prev.measured?.width !== next.measured?.width || prev.measured?.height !== next.measured?.height) {
      semantic.push(`${next.id} measured`);
    }
    if (prev.data?.label !== next.data?.label || prev.data?.subtitle !== next.data?.subtitle) {
      semantic.push(`${next.id} data`);
    }
    if (prev !== next && semantic.every((entry) => !entry.startsWith(next.id))) {
      referenceOnly.push(next.id);
    }
  }

  if (semantic.length > 0) {
    return {
      changed: true,
      referenceChanged: true,
      detail: semantic.slice(0, 6).join(", "),
    };
  }
  if (referenceOnly.length > 0) {
    return {
      changed: false,
      referenceChanged: true,
      detail: `reference-only ids: ${referenceOnly.slice(0, 6).join(", ")}`,
    };
  }
  return { changed: false, referenceChanged: before !== after, detail: "no semantic diff" };
}

export function traceDocumentToFlowNodes(
  caller: string,
  reason: string,
  documentNodeCount: number,
  result: NodeLike[],
  meta?: Record<string, unknown>,
) {
  push({
    kind: "documentToFlowNodes",
    caller,
    reason,
    nodeCount: result.length,
    changed: true,
    referenceChanged: true,
    detail: `documentNodes=${documentNodeCount}`,
    meta,
  });
}

export function traceSyncEffect(
  caller: string,
  reason: string,
  nodeCount: number,
  skipped: boolean,
  meta?: Record<string, unknown>,
) {
  push({
    kind: "syncEffect",
    caller,
    reason: skipped ? `SKIPPED: ${reason}` : reason,
    nodeCount,
    changed: !skipped,
    referenceChanged: !skipped,
    meta,
  });
}

export function summarizeNodeChanges(changes: NodeChange[]): string {
  const parts = changes.map((change) => {
    if (change.type === "position") {
      return `position:${change.id}${change.dragging ? ":dragging" : ""}`;
    }
    if (change.type === "dimensions") return `dimensions:${change.id}`;
    if (change.type === "select") return `select:${change.id}:${change.selected}`;
    if (change.type === "remove") return `remove:${change.id}`;
    if (change.type === "add") return `add:${change.id}`;
    if (change.type === "replace") return `replace:${change.id}`;
    return change.type;
  });
  return parts.slice(0, 12).join(", ");
}

export function traceOnNodesChange(
  caller: string,
  reason: string,
  changes: NodeChange[],
  nodeCountBefore: number,
) {
  push({
    kind: "onNodesChange",
    caller,
    reason,
    nodeCount: nodeCountBefore,
    changed: changes.length > 0,
    referenceChanged: changes.length > 0,
    detail: summarizeNodeChanges(changes),
    meta: { changeCount: changes.length },
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
}

export type SetNodesCallMeta = {
  caller: string;
  reason: string;
};
