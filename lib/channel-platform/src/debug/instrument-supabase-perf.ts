import type { SupabaseClient } from "@supabase/supabase-js";
import { waPerfMeasure } from "./whatsapp-pipeline-perf.js";
import { waTraceRecordQuery } from "./whatsapp-conversation-trace-bridge.js";

type WorkflowXRayQuerySink = {
  recordQuery(input: {
    target: string;
    operation: string;
    durationMs: number;
    rowCount: number | null;
    nodeId?: string | null;
  }): void;
  activeNodeId?: () => string | null;
};

function getWorkflowXRaySink(): WorkflowXRayQuerySink | null {
  const host = globalThis as Record<string, unknown>;
  const getter = host["__WORKFLOW_GET_XRAY__"];
  if (typeof getter === "function") {
    return (getter as () => WorkflowXRayQuerySink | null)() ?? null;
  }
  return (host["__WORKFLOW_XRAY__"] as WorkflowXRayQuerySink | undefined) ?? null;
}

function getActiveWorkflowNodeId(): string | null {
  const host = globalThis as Record<string, unknown>;
  const getter = host["__WORKFLOW_GET_XRAY_ACTIVE_NODE__"];
  if (typeof getter === "function") {
    return (getter as () => string | null)() ?? null;
  }
  return getWorkflowXRaySink()?.activeNodeId?.() ?? null;
}

/**
 * Wrap Supabase `.from()` / `.rpc()` so awaited queries emit profiler stages
 * when a WhatsApp inbound profiler is active, and feed Workflow X-Ray when active.
 */
export function instrumentSupabaseClientForWhatsAppPerf<T extends SupabaseClient>(
  client: T,
): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) =>
          instrumentThenableBuilder(
            Reflect.apply(target.from, target, [table]),
            table,
            "select",
          );
      }
      if (prop === "rpc") {
        return (fnName: string, args?: Record<string, unknown>) =>
          instrumentThenableBuilder(
            Reflect.apply(target.rpc, target, [fnName, args]),
            fnName,
            "rpc",
          );
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}

function inferOperation(prop: string, current: string): string {
  if (
    prop === "insert" ||
    prop === "update" ||
    prop === "delete" ||
    prop === "upsert" ||
    prop === "select"
  ) {
    return prop;
  }
  return current;
}

function countRows(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const data = (result as { data?: unknown }).data;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") return 1;
  if (data == null) return 0;
  return null;
}

function instrumentThenableBuilder(
  builder: unknown,
  targetName: string,
  operation: string,
): unknown {
  if (!builder || typeof builder !== "object") return builder;

  return new Proxy(builder as object, {
    get(target, prop, receiver) {
      if (prop === "then") {
        const then = Reflect.get(target, prop, receiver);
        if (typeof then !== "function") return then;
        return (onFulfilled?: unknown, onRejected?: unknown) => {
          const stageName =
            operation === "rpc"
              ? `Supabase rpc: ${targetName}`
              : `Supabase query: ${targetName}`;
          const started = Date.now();
          return waPerfMeasure(stageName, () =>
            Promise.resolve(target).then(
              (value) => {
                const durationMs = Date.now() - started;
                getWorkflowXRaySink()?.recordQuery({
                  target: targetName,
                  operation,
                  durationMs,
                  rowCount: countRows(value),
                  nodeId: getActiveWorkflowNodeId(),
                });
                waTraceRecordQuery(durationMs);
                return typeof onFulfilled === "function"
                  ? (onFulfilled as (v: unknown) => unknown)(value)
                  : value;
              },
              (reason) => {
                const durationMs = Date.now() - started;
                getWorkflowXRaySink()?.recordQuery({
                  target: targetName,
                  operation,
                  durationMs,
                  rowCount: null,
                  nodeId: getActiveWorkflowNodeId(),
                });
                waTraceRecordQuery(durationMs);
                if (typeof onRejected === "function") {
                  return (onRejected as (r: unknown) => unknown)(reason);
                }
                throw reason;
              },
            ),
          );
        };
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      return (...args: unknown[]) => {
        const next = value.apply(target, args);
        if (next && typeof next === "object" && typeof (next as { then?: unknown }).then === "function") {
          const nextOp =
            typeof prop === "string" ? inferOperation(prop, operation) : operation;
          return instrumentThenableBuilder(next, targetName, nextOp);
        }
        return next;
      };
    },
  });
}
