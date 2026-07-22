import { createInitialBuilderState } from "./builder-reducer";
import type { HistoryState } from "./history";
import type { WorkflowDocument } from "../types";

export function remapSelectionAfterSave(
  previousNodes: WorkflowDocument["nodes"],
  previousSelection: string[],
  savedNodes: WorkflowDocument["nodes"],
): string[] {
  const idMap = new Map<string, string>();
  previousNodes.forEach((node, index) => {
    const savedNode = savedNodes[index];
    if (savedNode) {
      idMap.set(node.id, savedNode.id);
    }
  });
  return previousSelection
    .map((id) => idMap.get(id) ?? id)
    .filter((id) => savedNodes.some((node) => node.id === id));
}

export function mergeLifecycleMetadata(live: WorkflowDocument, saved: WorkflowDocument): WorkflowDocument {
  return {
    ...live,
    activeVersionId: saved.activeVersionId,
    activeVersionNumber: saved.activeVersionNumber,
    hasUnpublishedDraft: saved.hasUnpublishedDraft,
    status: saved.status,
  };
}

export function mergePersistedState(
  current: HistoryState,
  saved: WorkflowDocument,
  keptSelection: string[],
): HistoryState {
  const next = createInitialBuilderState(saved);
  return {
    past: current.past,
    present: {
      ...next,
      document: {
        ...next.document,
        viewport: current.present.document.viewport,
      },
      selectedNodeIds: keptSelection,
      selectedEdgeIds: current.present.selectedEdgeIds,
      saveStatus: "saved",
    },
    future: [],
  };
}

/**
 * Applies a successful save/publish result without clobbering edits made while
 * the async persist was in flight.
 */
export function applyPersistedSaveResult(current: HistoryState, saved: WorkflowDocument): HistoryState {
  if (current.present.saveStatus === "dirty") {
    return {
      ...current,
      present: {
        ...current.present,
        document: mergeLifecycleMetadata(current.present.document, saved),
        saveStatus: "dirty",
      },
      future: [],
    };
  }

  const keptSelection = remapSelectionAfterSave(
    current.present.document.nodes,
    current.present.selectedNodeIds,
    saved.nodes,
  );
  return mergePersistedState(current, saved, keptSelection);
}
