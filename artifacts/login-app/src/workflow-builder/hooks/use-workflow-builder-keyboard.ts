import { useEffect, useRef } from "react";
import type { WorkflowBuilderController } from "./use-workflow-builder";

/**
 * Canvas keyboard shortcuts. Uses a controller ref so Delete always sees the
 * latest edge/node selection (stale closures previously dropped edge deletes).
 */
export function useWorkflowBuilderKeyboard(controller: WorkflowBuilderController) {
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (editingField) return;

      const active = controllerRef.current;
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        active.undo();
        return;
      }
      if (
        (meta && event.key.toLowerCase() === "y") ||
        (meta && event.shiftKey && event.key.toLowerCase() === "z")
      ) {
        event.preventDefault();
        active.redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "d") {
        if (active.state.selectedNodeIds.length === 0) return;
        event.preventDefault();
        active.duplicateSelected();
        return;
      }
      if (meta && event.key.toLowerCase() === "c") {
        if (active.state.selectedNodeIds.length === 0) return;
        event.preventDefault();
        active.dispatch({ type: "COPY_NODES", nodeIds: active.state.selectedNodeIds });
        return;
      }
      if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        active.dispatch({ type: "PASTE_NODES" });
        return;
      }
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void active.persist();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        const edgeIds = active.state.selectedEdgeIds;
        if (edgeIds.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          active.dispatch({ type: "DELETE_EDGES", edgeIds: [...edgeIds] });
          return;
        }
        const nodeIds = active.state.selectedNodeIds;
        if (nodeIds.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          active.dispatch({ type: "DELETE_NODES", nodeIds: [...nodeIds] });
        }
      }
    };

    // Capture phase so Delete reaches us before React Flow / browser shortcuts.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
