import { useEffect } from "react";
import type { WorkflowBuilderController } from "./use-workflow-builder";

export function useWorkflowBuilderKeyboard(controller: WorkflowBuilderController) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (editingField) return;

      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        controller.undo();
        return;
      }
      if ((meta && event.key.toLowerCase() === "y") || (meta && event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        controller.redo();
        return;
      }
      if (meta && event.key.toLowerCase() === "d") {
        if (controller.state.selectedNodeIds.length === 0) return;
        event.preventDefault();
        controller.duplicateSelected();
        return;
      }
      if (meta && event.key.toLowerCase() === "c") {
        if (controller.state.selectedNodeIds.length === 0) return;
        event.preventDefault();
        controller.dispatch({ type: "COPY_NODES", nodeIds: controller.state.selectedNodeIds });
        return;
      }
      if (meta && event.key.toLowerCase() === "v") {
        event.preventDefault();
        controller.dispatch({ type: "PASTE_NODES" });
        return;
      }
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void controller.persist();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (controller.state.selectedEdgeIds.length === 0) return;
        event.preventDefault();
        controller.dispatch({ type: "DELETE_EDGES", edgeIds: controller.state.selectedEdgeIds });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller]);
}
