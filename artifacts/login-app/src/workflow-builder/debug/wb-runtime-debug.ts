/** Temporary runtime instrumentation — remove after debug session. */
type WbDebugEntry = {
  t: number;
  seq: number;
  tag: string;
  data?: unknown;
};

declare global {
  interface Window {
    __WB_DEBUG_LOGS__?: WbDebugEntry[];
    __WB_DEBUG_DUMP__?: () => WbDebugEntry[];
    __WB_POSITION_TRACE_ID__?: number;
    __WB_RENDER_COUNTS__?: Record<string, number>;
  }
}

let seq = 0;

function ensureStore(): WbDebugEntry[] {
  if (typeof window === "undefined") return [];
  if (!window.__WB_DEBUG_LOGS__) {
    window.__WB_DEBUG_LOGS__ = [];
    window.__WB_DEBUG_DUMP__ = () => [...(window.__WB_DEBUG_LOGS__ ?? [])];
  }
  return window.__WB_DEBUG_LOGS__;
}

export function wbDebug(tag: string, data?: unknown) {
  const entry: WbDebugEntry = { t: Date.now(), seq: ++seq, tag, data };
  if (typeof window !== "undefined") {
    ensureStore().push(entry);
  }
  console.log(`[WB-DEBUG ${entry.seq}] ${tag}`, data ?? "");
}

export function wbDebugMount(component: string) {
  wbDebug(`${component} mounted`);
  return () => wbDebug(`${component} unmounted`);
}

export function wbBumpRenderCount(component: string) {
  if (typeof window === "undefined") return;
  if (!window.__WB_RENDER_COUNTS__) {
    window.__WB_RENDER_COUNTS__ = {};
  }
  window.__WB_RENDER_COUNTS__[component] = (window.__WB_RENDER_COUNTS__[component] ?? 0) + 1;
}

export function nextPositionTraceId(): number {
  if (typeof window === "undefined") return 0;
  const next = (window.__WB_POSITION_TRACE_ID__ ?? 0) + 1;
  window.__WB_POSITION_TRACE_ID__ = next;
  return next;
}

export type NodePositionRow = { id: string; x: number; y: number };

export function positionsFromDocumentNodes(
  nodes: Array<{ id: string; position: { x: number; y: number } }>,
): NodePositionRow[] {
  return nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
}

export function positionsFromFlowNodes(nodes: Array<{ id: string; position: { x: number; y: number } }>): NodePositionRow[] {
  return nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
}

/** DOM `.react-flow__node` transform + computed left/top. */
export function readDomNodeTransforms(): Array<{
  id: string;
  transform: string;
  left: number;
  top: number;
}> {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll(".react-flow__node")].map((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      id: el.getAttribute("data-id") ?? "",
      transform: style.transform,
      left: rect.left,
      top: rect.top,
    };
  });
}

type PositionMismatch = {
  id: string;
  reason: string;
  expected: NodePositionRow;
  actual: NodePositionRow | null;
};

export function wbDebugPositionPipeline(
  stage: string,
  data: {
    traceId?: number;
    positions?: NodePositionRow[];
    expected?: NodePositionRow[];
    extra?: unknown;
  },
) {
  const expected = data.expected ?? [];
  const positions = data.positions ?? [];
  const mismatches: PositionMismatch[] = [];
  for (const exp of expected) {
    const actual = positions.find((row) => row.id === exp.id);
    if (!actual) {
      mismatches.push({ id: exp.id, reason: "missing", expected: exp, actual: null });
      continue;
    }
    if (actual.x !== exp.x || actual.y !== exp.y) {
      mismatches.push({ id: exp.id, reason: "position", expected: exp, actual });
    }
  }

  wbDebug(`PIPELINE ${stage}`, {
    traceId: data.traceId,
    positions,
    mismatches: mismatches.length > 0 ? mismatches : undefined,
    ...((data.extra as object) ?? {}),
  });

  if (mismatches.length > 0) {
    wbDebug("PIPELINE POSITION LOST", { stage, traceId: data.traceId, mismatches });
  }
}

let lastRfSelectionIds: string[] = [];

export function setLastRfSelection(ids: string[]) {
  lastRfSelectionIds = ids;
}

export function getLastRfSelection(): string[] {
  return lastRfSelectionIds;
}

export function readDomRfSelectedNodeIds(): string[] {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll(".react-flow__node.selected")]
    .map((el) => el.getAttribute("data-id") ?? "")
    .filter(Boolean);
}

export type SelectionSnapshot = {
  source: string;
  builderSelectedNodeIds: string[];
  builderSelectedCount: number;
  liveCanvasSelection: string[];
  selectedRef: string[];
  rfStateSelectedIds: string[];
  rfStateSelectedCount: number;
  domRfSelectedIds: string[];
  domRfSelectedCount: number;
  syncMismatch: boolean;
};

export function wbDebugSelectionSnapshot(
  source: string,
  parts: {
    builderSelectedNodeIds?: string[];
    liveCanvasSelection?: string[];
    selectedRef?: string[];
    rfStateSelectedIds?: string[];
  },
) {
  const builderSelectedNodeIds = parts.builderSelectedNodeIds ?? [];
  const rfStateSelectedIds = parts.rfStateSelectedIds ?? [];
  const domRfSelectedIds = readDomRfSelectedNodeIds();
  const builderCount = builderSelectedNodeIds.length;
  const rfCount = rfStateSelectedIds.length;
  const domCount = domRfSelectedIds.length;
  const maxVisible = Math.max(rfCount, domCount);
  const syncMismatch = maxVisible >= 2 && builderCount < 2;

  const snapshot: SelectionSnapshot = {
    source,
    builderSelectedNodeIds,
    builderSelectedCount: builderCount,
    liveCanvasSelection: parts.liveCanvasSelection ?? [],
    selectedRef: parts.selectedRef ?? [],
    rfStateSelectedIds,
    rfStateSelectedCount: rfCount,
    domRfSelectedIds,
    domRfSelectedCount: domCount,
    syncMismatch,
  };

  wbDebug(syncMismatch ? "SELECTION SYNC MISMATCH" : "selection snapshot", snapshot);
  return snapshot;
}

export function installWbGlobalListeners() {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __WB_LISTENERS__?: boolean }).__WB_LISTENERS__) return;
  (window as unknown as { __WB_LISTENERS__?: boolean }).__WB_LISTENERS__ = true;

  window.addEventListener("focus", () => {
    wbDebug("window focus");
    import("./wb-viewport-trace").then(({ wbTraceViewportPoll }) => wbTraceViewportPoll("window focus"));
  });
  window.addEventListener("blur", () => {
    wbDebug("window blur");
    import("./wb-viewport-trace").then(({ wbTraceViewportPoll }) => wbTraceViewportPoll("window blur"));
  });
  document.addEventListener("visibilitychange", () => {
    wbDebug("visibilitychange", { hidden: document.hidden, visibilityState: document.visibilityState });
    import("./wb-viewport-trace").then(({ wbTraceViewportPoll }) =>
      wbTraceViewportPoll(`visibilitychange:${document.visibilityState}`),
    );
  });
  window.addEventListener("pageshow", (event) => {
    wbDebug("pageshow", { persisted: event.persisted });
  });
  window.addEventListener("pagehide", (event) => {
    wbDebug("pagehide", { persisted: event.persisted });
  });
  window.addEventListener("beforeunload", () => {
    wbDebug("beforeunload", {});
  });
}
