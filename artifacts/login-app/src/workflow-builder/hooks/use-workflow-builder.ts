import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { alignmentPositionUpdates, type AlignmentMode } from "../core/layout/alignment";
import { autoLayoutWorkflow } from "../core/layout/auto-layout";
import {
  getLiveSelectedNodeIdsRef,
  lastKnownCanvasSelectionRef,
  readDomSelectedNodeIds,
  rememberCanvasSelection,
  resolveAlignmentSelection,
  selectionKey,
} from "../core/canvas/canvas-selection-guard";
import { createInitialBuilderState } from "../core/state/builder-reducer";
import {
  applyPersistedSaveResult,
} from "../core/state/persist-merge";
import {
  canRedo,
  canUndo,
  createHistoryState,
  historyReducer,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "../core/state/history";
import type { BuilderAction, BuilderNodeType, BuilderState, WorkflowDocument } from "../core/types";
import { createBuilderNode } from "../core/persistence/workflow-mapper";
import { validateWorkflow } from "../core/validation/workflow-validator";
import i18n from "i18next";
import { useWorkflowBuilderServices } from "../context/workflow-builder-services";

const AUTOSAVE_MS = 1500;
const UI_STATE_STORAGE_PREFIX = "workflow-builder-ui:";

/** Survives builder remounts within the same browser tab session. */
const builderSessionCache = new Map<string, HistoryState>();

type PersistedUiState = {
  viewport: WorkflowDocument["viewport"];
  selectedNodeIds: string[];
};

function readPersistedUiState(flowId: string): PersistedUiState | null {
  if (typeof window === "undefined" || !flowId) return null;
  try {
    const raw = window.sessionStorage.getItem(`${UI_STATE_STORAGE_PREFIX}${flowId}`);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedUiState;
  } catch {
    return null;
  }
}

function writePersistedUiState(flowId: string, state: BuilderState) {
  if (typeof window === "undefined" || !flowId) return;
  const payload: PersistedUiState = {
    viewport: state.document.viewport,
    selectedNodeIds: state.selectedNodeIds,
  };
  window.sessionStorage.setItem(`${UI_STATE_STORAGE_PREFIX}${flowId}`, JSON.stringify(payload));
}

function hydrateInitialState(document: WorkflowDocument): BuilderState {
  const initial = createInitialBuilderState(document);
  const persisted = readPersistedUiState(document.flowId);
  if (!persisted) return initial;

  const selectedNodeIds = persisted.selectedNodeIds.filter((id) =>
    document.nodes.some((node) => node.id === id),
  );

  return {
    ...initial,
    document: {
      ...initial.document,
      viewport: persisted.viewport ?? initial.document.viewport,
    },
    selectedNodeIds,
  };
}

export function useWorkflowBuilder(document: WorkflowDocument | null) {
  const { repository, context } = useWorkflowBuilderServices();
  const flowId = document?.flowId ?? "";

  const [history, setHistory] = useState<HistoryState>(() => {
    if (!document?.flowId) return createHistoryState(createInitialBuilderState(emptyDocument()));
    const cached = builderSessionCache.get(document.flowId);
    if (cached) return cached;
    return createHistoryState(hydrateInitialState(document));
  });
  const autosaveTimer = useRef<number | null>(null);
  const savingRef = useRef(false);
  const loadedFlowIdRef = useRef<string | null>(flowId || null);
  const documentRef = useRef(history.present.document);
  documentRef.current = history.present.document;
  const selectedNodeIdsRef = useRef(history.present.selectedNodeIds);
  selectedNodeIdsRef.current = history.present.selectedNodeIds;

  useEffect(() => {
    if (!document?.flowId) return;

    const cached = builderSessionCache.get(document.flowId);
    if (cached) {
      loadedFlowIdRef.current = document.flowId;
      setHistory((current) => (current === cached ? current : cached));
      return;
    }

    if (loadedFlowIdRef.current === document.flowId) return;
    loadedFlowIdRef.current = document.flowId;
    setHistory(createHistoryState(hydrateInitialState(document)));
  }, [document?.flowId]);

  useEffect(() => {
    if (history.present.selectedNodeIds.length > 0) {
      rememberCanvasSelection(history.present.selectedNodeIds);
    }
  }, [history.present.selectedNodeIds]);

  useEffect(() => {
    if (!document?.flowId) return;
    builderSessionCache.set(document.flowId, history);
    writePersistedUiState(document.flowId, history.present);
  }, [document?.flowId, history]);

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
      setHistory((current) => applyPersistedSaveResult(current, saved));
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
      setHistory((current) => {
        const merged = applyPersistedSaveResult(current, saved);
        if (merged.present.saveStatus === "dirty") {
          return merged;
        }
        return {
          ...merged,
          present: { ...merged.present, saveStatus: "published" },
        };
      });
      return saved;
    } catch (error) {
      dispatch({ type: "SET_SAVE_STATUS", status: "error" });
      throw error;
    }
  }, [context, repository, runValidation, dispatch]);

  const rollback = useCallback(
    async (targetVersionNumber: number) => {
      const saved = await repository.rollback(context, state.document.flowId, targetVersionNumber);
      const next = createHistoryState(createInitialBuilderState(saved));
      setHistory(next);
      builderSessionCache.set(saved.flowId, next);
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
    (mode: AlignmentMode, nodeIdsOverride?: string[]) => {
      const minRequired = mode.startsWith("distribute") ? 3 : 2;
      const documentNodeIds = new Set(documentRef.current.nodes.map((node) => node.id));
      const selectedIds = resolveAlignmentSelection(documentNodeIds, minRequired, {
        override: nodeIdsOverride,
        builderSelected: selectedNodeIdsRef.current,
        lastKnown: lastKnownCanvasSelectionRef.current,
        domSelected: readDomSelectedNodeIds(),
        liveSelected: getLiveSelectedNodeIdsRef.current(),
      });
      if (selectedIds.length < minRequired) return;

      rememberCanvasSelection(selectedIds);

      const positions = alignmentPositionUpdates(documentRef.current.nodes, selectedIds, mode);
      if (positions.length === 0) return;

      if (selectionKey(selectedNodeIdsRef.current) !== selectionKey(selectedIds)) {
        dispatch({ type: "SELECT_NODES", nodeIds: selectedIds });
      }
      dispatch({ type: "UPDATE_NODE_POSITIONS", positions });
    },
    [dispatch],
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
