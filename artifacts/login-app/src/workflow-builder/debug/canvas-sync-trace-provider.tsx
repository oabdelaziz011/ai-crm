/**
 * Debug-only canvas sync trace host — not loaded on the production dashboard path.
 */
import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { useStoreApi } from "@xyflow/react";
import type { NodeChange } from "@xyflow/react";
import {
  installCanvasSyncRuntimeTrace,
  summarizeNodeChanges,
  traceHandleNodesChange,
  traceOnNodesChange,
  traceNodesPropRender,
  traceSeedControlledNodesFromDocument,
  traceSetNodes,
  traceStoreUpdaterProp,
  traceSyncEffect,
} from "./canvas-node-sync-trace";
import { CanvasSyncTraceContext } from "./canvas-sync-trace-context";
import type { CanvasSyncTraceAdapter, CanvasSyncTraceHandles, CanvasSyncTraceNode } from "./canvas-sync-trace-types";

function createTraceAdapter(handlesRef: MutableRefObject<CanvasSyncTraceHandles | null>): CanvasSyncTraceAdapter {
  return {
    setNodes: (caller, reason, before, after, meta) => {
      traceSetNodes(caller, reason, before, after, meta);
    },
    onNodesChange: (caller, reason, changes, nodeCountBefore, meta) => {
      traceOnNodesChange(caller, reason, changes, nodeCountBefore, {
        changeSummary: summarizeNodeChanges(changes).join("|"),
        ...meta,
      });
    },
    handleNodesChange: (reason, changes, nodeCount, meta) => {
      traceHandleNodesChange(reason, changes, nodeCount, meta);
    },
    syncEffect: (reason, nodeCount, skipped, meta) => {
      traceSyncEffect(reason, nodeCount, skipped, meta);
    },
    seedControlledNodesFromDocument: (caller, reason, before, flowNodes, after) =>
      traceSeedControlledNodesFromDocument(caller, reason, before, flowNodes, after),
    nodesPropRender: (renderCount, before, after) => {
      traceNodesPropRender(renderCount, before, after);
    },
    storeUpdaterProp: (before, after, meta) => {
      traceStoreUpdaterProp(before, after, meta);
    },
    registerCanvasHandles: (handles) => {
      handlesRef.current = handles;
    },
  };
}

function CanvasSyncTraceRuntimeHost({
  handlesRef,
}: {
  handlesRef: MutableRefObject<CanvasSyncTraceHandles | null>;
}) {
  const storeApi = useStoreApi();

  useEffect(() => installCanvasSyncRuntimeTrace(), []);

  useEffect(() => {
    let previousNodes = storeApi.getState().nodes;
    return storeApi.subscribe((state) => {
      if (state.nodes === previousNodes) return;
      traceSetNodes(
        "RF-store(StoreUpdater/internal)",
        "React Flow zustand store nodes changed",
        previousNodes as CanvasSyncTraceNode[],
        state.nodes as CanvasSyncTraceNode[],
        { source: "useStoreApi.subscribe" },
      );
      previousNodes = state.nodes;
    });
  }, [storeApi]);

  useEffect(() => {
    (window as unknown as { __WB_CANVAS_DEBUG__?: Record<string, unknown> }).__WB_CANVAS_DEBUG__ = {
      dump: () => window.__WB_CANVAS_SYNC_DUMP__?.(),
      tail: (n?: number) => window.__WB_CANVAS_SYNC_TAIL__?.(n),
      lastSetNodes: () =>
        [...(window.__WB_CANVAS_SYNC_DUMP__?.() ?? [])].reverse().find((entry) => entry.kind === "setNodes"),
      clear: () => {
        if (window.__WB_CANVAS_SYNC_LOGS__) window.__WB_CANVAS_SYNC_LOGS__.length = 0;
      },
      invokeHandleNodesChange: (changes: NodeChange[]) => handlesRef.current?.handleNodesChange(changes),
      getStoreNodes: () => handlesRef.current?.getStoreNodes() ?? storeApi.getState().nodes,
      triggerStoreNodeChanges: (changes: NodeChange[]) => {
        storeApi.getState().triggerNodeChanges(changes);
      },
    };

    return () => {
      delete (window as unknown as { __WB_CANVAS_DEBUG__?: Record<string, unknown> }).__WB_CANVAS_DEBUG__;
    };
  }, [handlesRef, storeApi]);

  return null;
}

export function CanvasSyncTraceProvider({ children }: { children: ReactNode }) {
  const handlesRef = useRef<CanvasSyncTraceHandles | null>(null);
  const adapter = useMemo(() => createTraceAdapter(handlesRef), []);

  return (
    <CanvasSyncTraceContext.Provider value={adapter}>
      <CanvasSyncTraceRuntimeHost handlesRef={handlesRef} />
      {children}
    </CanvasSyncTraceContext.Provider>
  );
}
