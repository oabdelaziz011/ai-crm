/**
 * Browser-safe bridge for Workflow Performance X-Ray.
 * Server installs the real profiler via workflow-xray.ts.
 */

export type WorkflowXRayQueryOp =
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "upsert"
  | "rpc"
  | "maybeSingle"
  | "single"
  | "unknown";

type WorkflowXRayLike = {
  beginWorkflow(meta?: Record<string, unknown>): void;
  endWorkflow(): void;
  beginNode(input: { id: string; name: string; type: string }): string;
  endNode(token: string): void;
  recordQuery(input: {
    target: string;
    operation: string;
    durationMs: number;
    rowCount: number | null;
    nodeId?: string | null;
  }): void;
  recordServiceResolution(name: string): void;
  recordDependencyConstruction(name: string): void;
  recordSequentialChain(label: string, tasks: string[]): void;
  measure<T>(name: string, fn: () => Promise<T>): Promise<T>;
  printReport(): void;
};

const GLOBAL_KEY = "__WORKFLOW_XRAY__";
const GLOBAL_GETTER_KEY = "__WORKFLOW_GET_XRAY__";

function getXRay(): WorkflowXRayLike | null {
  const host = globalThis as Record<string, unknown>;
  const getter = host[GLOBAL_GETTER_KEY];
  if (typeof getter === "function") {
    return (getter as () => WorkflowXRayLike | null)() ?? null;
  }
  return (host[GLOBAL_KEY] as WorkflowXRayLike | undefined) ?? null;
}

export function wxBeginWorkflow(meta?: Record<string, unknown>): void {
  getXRay()?.beginWorkflow(meta);
}

export function wxEndWorkflow(): void {
  getXRay()?.endWorkflow();
}

export function wxBeginNode(input: { id: string; name: string; type: string }): string | null {
  const token = getXRay()?.beginNode(input) ?? null;
  // Sprint 2.4: count node on conversation TRACE when ALS is active (no-op otherwise).
  const host = globalThis as Record<string, unknown>;
  const getter = host["__WHATSAPP_GET_CONVERSATION_TRACE__"];
  if (typeof getter === "function") {
    const trace = (getter as () => { recordNode?: () => void } | null)();
    trace?.recordNode?.();
  }
  return token;
}

export function wxEndNode(token: string | null): void {
  if (!token) return;
  getXRay()?.endNode(token);
}

export function wxRecordQuery(input: {
  target: string;
  operation: string;
  durationMs: number;
  rowCount: number | null;
  nodeId?: string | null;
}): void {
  getXRay()?.recordQuery(input);
}

export function wxRecordServiceResolution(name: string): void {
  getXRay()?.recordServiceResolution(name);
}

export function wxRecordDependencyConstruction(name: string): void {
  getXRay()?.recordDependencyConstruction(name);
}

export function wxRecordSequentialChain(label: string, tasks: string[]): void {
  getXRay()?.recordSequentialChain(label, tasks);
}

export async function wxMeasure<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const xray = getXRay();
  if (!xray) return fn();
  return xray.measure(name, fn);
}

export function wxPrintReport(): void {
  getXRay()?.printReport();
}

export function wxActiveNodeId(): string | null {
  const host = globalThis as Record<string, unknown>;
  const getter = host["__WORKFLOW_GET_XRAY_ACTIVE_NODE__"];
  if (typeof getter === "function") {
    return (getter as () => string | null)() ?? null;
  }
  return null;
}
