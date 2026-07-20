import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { alignmentPositionUpdates, type AlignmentMode } from "../core/layout/alignment";
import { autoLayoutWorkflow } from "../core/layout/auto-layout";
import { createEdgeFromNodes, createInitialBuilderState } from "../core/state/builder-reducer";
import {
  canRedo,
  canUndo,
  createHistoryState,
  historyReducer,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "../core/state/history";
import type { BuilderAction, BuilderNodeType, WorkflowDocument } from "../core/types";
import { createBuilderNode } from "../core/persistence/workflow-mapper";
import { validateWorkflow } from "../core/validation/workflow-validator";
import i18n from "i18next";
import { useWorkflowBuilderServices } from "../context/workflow-builder-services";

const AUTOSAVE_MS = 1500;

function remapSelectionAfterSave(
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

export function useWorkflowBuilder(document: WorkflowDocument | null) {
  const { repository, context } = useWorkflowBuilderServices();
  const [history, setHistory] = useState<HistoryState>(() =>
    createHistoryState(createInitialBuilderState(document ?? emptyDocument())),
  );
  const autosaveTimer = useRef<number | null>(null);
  const savingRef = useRef(false);
  const loadedFlowIdRef = useRef<string | null>(null);
  const documentRef = useRef(history.present.document);
  documentRef.current = history.present.document;
  const selectedNodeIdsRef = useRef<string[]>(history.present.selectedNodeIds);
  if (history.present.selectedNodeIds.length > 0) {
    selectedNodeIdsRef.current = history.present.selectedNodeIds;
  }

  useEffect(() => {
    if (!document?.flowId) return;
    if (loadedFlowIdRef.current === document.flowId) return;
    loadedFlowIdRef.current = document.flowId;
    setHistory(createHistoryState(createInitialBuilderState(document)));
  }, [document?.flowId]);

  const state = history.present;
  const dispatch = useCallback((action: BuilderAction) => {
    setHistory((current) => historyReducer(current, action));
  }, []);

  const runValidation = useCallback(() => {
    const issues = validateWorkflow(documentRef.current);
    dispatch({ type: "SET_VALIDATION", issues });
    return issues;
  }, [dispatch]);

  const persist = useCallback(async () => {
    if (savingRef.current) return documentRef.current;
    savingRef.current = true;
    dispatch({ type: "SET_SAVE_STATUS", status: "saving" });
    try {
      const saved = await repository.save(context, documentRef.current);
      setHistory((current) => {
        const next = createInitialBuilderState(saved);
        const keptSelection = remapSelectionAfterSave(
          current.present.document.nodes,
          current.present.selectedNodeIds,
          saved.nodes,
        );
        return createHistoryState({
          ...next,
          document: {
            ...next.document,
            viewport: current.present.document.viewport,
          },
          selectedNodeIds: keptSelection,
          saveStatus: "saved",
        });
      });
      return saved;
    } catch {
      dispatch({ type: "SET_SAVE_STATUS", status: "error" });
      throw new Error(i18n.t("workflowBuilder.errors.saveFailed", { ns: "common" }));
    } finally {
      savingRef.current = false;
    }
  }, [context, repository, dispatch]);

  useEffect(() => {
    if (state.saveStatus !== "dirty") return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      void persist().catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [state.saveStatus, persist]);

  const publish = useCallback(async (releaseNotes?: string) => {
    const issues = runValidation();
    if (issues.some((issue) => issue.severity === "error")) {
      throw new Error(i18n.t("workflowBuilder.publish.error", { ns: "common" }));
    }
    dispatch({ type: "SET_SAVE_STATUS", status: "publishing" });
    try {
      const saved = await repository.publish(context, documentRef.current, releaseNotes);
      setHistory(createHistoryState({ ...createInitialBuilderState(saved), saveStatus: "published" }));
      return saved;
    } catch (error) {
      dispatch({ type: "SET_SAVE_STATUS", status: "error" });
      throw error;
    }
  }, [context, repository, runValidation, dispatch]);

  const rollback = useCallback(
    async (targetVersionNumber: number) => {
      const saved = await repository.rollback(context, state.document.flowId, targetVersionNumber);
      setHistory(createHistoryState(createInitialBuilderState(saved)));
      return saved;
    },
    [context, repository, state.document.flowId],
  );

  const hasUnsavedChanges = state.saveStatus === "dirty" || state.saveStatus === "error";

  const addNode = useCallback(
    (type: BuilderNodeType, position: { x: number; y: number }) => {
      dispatch({ type: "ADD_NODE", node: createBuilderNode(type, position) });
    },
    [dispatch],
  );

  const insertNodeAfter = useCallback(
    (sourceNodeId: string, type: BuilderNodeType, position: { x: number; y: number }) => {
      dispatch({ type: "INSERT_NODE_AFTER", sourceNodeId, node: createBuilderNode(type, position) });
    },
    [dispatch],
  );

  const duplicateSelected = useCallback(() => {
    if (state.selectedNodeIds.length === 0) return;
    dispatch({ type: "DUPLICATE_NODES", nodeIds: state.selectedNodeIds });
  }, [dispatch, state.selectedNodeIds]);

  const alignSelected = useCallback(
    (mode: AlignmentMode) => {
      const selectedIds =
        state.selectedNodeIds.length > 0 ? state.selectedNodeIds : selectedNodeIdsRef.current;
      if (selectedIds.length < 2 && !mode.startsWith("distribute")) return;
      if (selectedIds.length < 3 && mode.startsWith("distribute")) return;

      const positions = alignmentPositionUpdates(documentRef.current.nodes, selectedIds, mode);
      if (positions.length === 0) return;

      dispatch({ type: "UPDATE_NODE_POSITIONS", positions });

      if (state.selectedNodeIds.length === 0 && selectedIds.length > 0) {
        dispatch({ type: "SELECT_NODES", nodeIds: selectedIds });
      }
    },
    [dispatch, state.selectedNodeIds],
  );

  const applyAutoLayout = useCallback(() => {
    const laidOut = autoLayoutWorkflow(documentRef.current.nodes, documentRef.current.edges);
    const positions = laidOut.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
    dispatch({ type: "UPDATE_NODE_POSITIONS", positions });
  }, [dispatch]);

  const undo = useCallback(() => setHistory((current) => undoHistory(current)), []);
  const redo = useCallback(() => setHistory((current) => redoHistory(current)), []);

  return useMemo(
    () => ({
      state,
      dispatch,
      addNode,
      insertNodeAfter,
      duplicateSelected,
      alignSelected,
      applyAutoLayout,
      persist,
      publish,
      rollback,
      hasUnsavedChanges,
      runValidation,
      undo,
      redo,
      canUndo: canUndo(history),
      canRedo: canRedo(history),
    }),
    [state, dispatch, addNode, insertNodeAfter, duplicateSelected, alignSelected, applyAutoLayout, persist, publish, rollback, hasUnsavedChanges, runValidation, undo, redo, history],
  );
}

function emptyDocument(): WorkflowDocument {
  return {
    flowId: "",
    companyId: "",
    name: "",
    description: "",
    triggerType: "inbound_message",
    status: "draft",
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export type WorkflowBuilderController = ReturnType<typeof useWorkflowBuilder>;
