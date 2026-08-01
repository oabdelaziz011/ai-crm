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
import { documentTopologySignature } from "../core/canvas/document-signatures";
import { builderReducer, createInitialBuilderState } from "../core/state/builder-reducer";
import { applyPersistedSaveResult } from "../core/state/persist-merge";
import {
  canRedo,
  canUndo,
  createHistoryState,
  historyReducer,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "../core/state/history";
import type { BuilderAction, BuilderNodeType, BuilderState, ValidationIssue, WorkflowDocument } from "../core/types";
import { createBuilderNode } from "../core/persistence/workflow-mapper";
import {
  mergeValidationIssues,
  validateWorkflow,
  validateWorkflowNodeConfigs,
  validateWorkflowStructure,
} from "../core/validation/workflow-validator";
import i18n from "i18next";
import { useWorkflowBuilderServices } from "../context/workflow-builder-services";
import { builderRenderPerf } from "../debug/builder-render-perf";

export { builderRenderPerf, type BuilderRenderPerfCounters } from "../debug/builder-render-perf";

const AUTOSAVE_MS = 1500;
const VALIDATION_DEBOUNCE_MS = 250;
const HISTORY_BATCH_MS = 400;
const UI_STATE_STORAGE_PREFIX = "workflow-builder-ui:";
const HISTORY_LIMIT = 50;

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

function configValidationSignature(document: WorkflowDocument): string {
  return JSON.stringify({
    name: document.name,
    triggerType: document.triggerType,
    extensions: document.extensions ?? null,
    nodes: document.nodes.map((node) => ({ id: node.id, type: node.type, config: node.config })),
  });
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
  const validationTimer = useRef<number | null>(null);
  const historyBatchTimer = useRef<number | null>(null);
  const savingRef = useRef(false);
  const focusValidationIssueRef = useRef<(issue: ValidationIssue) => void>(() => {});
  const loadedFlowIdRef = useRef<string | null>(flowId || null);
  const documentRef = useRef(history.present.document);
  documentRef.current = history.present.document;
  const selectedNodeIdsRef = useRef(history.present.selectedNodeIds);
  selectedNodeIdsRef.current = history.present.selectedNodeIds;

  const batchBaseRef = useRef<BuilderState | null>(null);
  const topologySigRef = useRef("");
  const structuralIssuesRef = useRef<ValidationIssue[]>([]);
  const configSigRef = useRef("");

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

  const flushHistoryBatch = useCallback(() => {
    if (!batchBaseRef.current) return;
    const base = batchBaseRef.current;
    batchBaseRef.current = null;
    setHistory((current) => {
      if (current.present === base) return current;
      const past = [...current.past, base].slice(-HISTORY_LIMIT);
      return { ...current, past, future: [] };
    });
    setHistory((current) => historyReducer(current, { type: "SET_LAYOUT_ANIMATION", enabled: true }));
  }, []);

  const scheduleHistoryBatchFlush = useCallback(() => {
    if (historyBatchTimer.current) window.clearTimeout(historyBatchTimer.current);
    historyBatchTimer.current = window.setTimeout(() => {
      flushHistoryBatch();
    }, HISTORY_BATCH_MS);
  }, [flushHistoryBatch]);

  const dispatchRaw = useCallback((action: BuilderAction) => {
    setHistory((current) => historyReducer(current, action));
  }, []);

  const dispatch = useCallback(
    (action: BuilderAction) => {
      const isBatchedEdit =
        (action.type === "UPDATE_NODE_CONFIG" && action.batch !== false) ||
        (action.type === "SET_METADATA" && action.batch !== false);

      if (isBatchedEdit) {
        setHistory((current) => {
          if (!batchBaseRef.current) {
            batchBaseRef.current = current.present;
          }
          const nextPresent = builderReducer(current.present, action);
          if (nextPresent === current.present) return current;
          const withLayoutOff =
            nextPresent.layoutAnimationEnabled === false
              ? nextPresent
              : { ...nextPresent, layoutAnimationEnabled: false };
          return { ...current, present: withLayoutOff };
        });
        scheduleHistoryBatchFlush();
        return;
      }

      if (batchBaseRef.current) {
        flushHistoryBatch();
      }
      dispatchRaw(action);
    },
    [dispatchRaw, flushHistoryBatch, scheduleHistoryBatchFlush],
  );

  const updateNodeConfig = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      dispatch({ type: "UPDATE_NODE_CONFIG", nodeId, patch, batch: true });
    },
    [dispatch],
  );

  const setMetadata = useCallback(
    (patch: Partial<Pick<WorkflowDocument, "name" | "description" | "triggerType" | "extensions">>) => {
      dispatch({ type: "SET_METADATA", patch, batch: true });
    },
    [dispatch],
  );

  const runValidation = useCallback(() => {
    const doc = documentRef.current;
    const topologySig = documentTopologySignature(doc);
    const configSig = configValidationSignature(doc);
    const topologyChanged = topologySig !== topologySigRef.current;
    const configChanged = configSig !== configSigRef.current;

    if (!topologyChanged && !configChanged) {
      return state.validationIssues;
    }

    builderRenderPerf.validationRuns += 1;

    if (topologyChanged) {
      structuralIssuesRef.current = validateWorkflowStructure(doc);
      topologySigRef.current = topologySig;
      builderRenderPerf.structuralValidationRuns += 1;
    }

    let configIssues: ValidationIssue[] = [];
    if (configChanged) {
      configIssues = validateWorkflowNodeConfigs(doc);
      configSigRef.current = configSig;
      builderRenderPerf.configValidationRuns += 1;
    } else if (topologyChanged) {
      configIssues = validateWorkflowNodeConfigs(doc);
      configSigRef.current = configSig;
    }

    const issues = mergeValidationIssues(doc, structuralIssuesRef.current, configIssues);
    dispatchRaw({ type: "SET_VALIDATION", issues });
    return issues;
  }, [dispatchRaw, state.validationIssues]);

  const runFullValidation = useCallback(() => {
    const doc = documentRef.current;
    const issues = validateWorkflow(doc);
    topologySigRef.current = documentTopologySignature(doc);
    configSigRef.current = configValidationSignature(doc);
    structuralIssuesRef.current = validateWorkflowStructure(doc);
    builderRenderPerf.validationRuns += 1;
    builderRenderPerf.structuralValidationRuns += 1;
    builderRenderPerf.configValidationRuns += 1;
    dispatchRaw({ type: "SET_VALIDATION", issues });
    return issues;
  }, [dispatchRaw]);

  useEffect(() => {
    const topologySig = documentTopologySignature(history.present.document);
    const configSig = configValidationSignature(history.present.document);
    if (topologySigRef.current === "" && configSigRef.current === "") {
      topologySigRef.current = topologySig;
      configSigRef.current = configSig;
      structuralIssuesRef.current = validateWorkflowStructure(history.present.document);
    }
  }, [history.present.document]);

  useEffect(() => {
    if (validationTimer.current) window.clearTimeout(validationTimer.current);
    validationTimer.current = window.setTimeout(() => {
      runValidation();
    }, VALIDATION_DEBOUNCE_MS);
    return () => {
      if (validationTimer.current) window.clearTimeout(validationTimer.current);
    };
  }, [history.present.document, runValidation]);

  const persist = useCallback(async () => {
    if (batchBaseRef.current) flushHistoryBatch();
    if (savingRef.current) return documentRef.current;
    savingRef.current = true;
    dispatchRaw({ type: "SET_SAVE_STATUS", status: "saving" });
    try {
      const saved = await repository.save(context, documentRef.current);
      setHistory((current) => applyPersistedSaveResult(current, saved));
      return saved;
    } catch {
      dispatchRaw({ type: "SET_SAVE_STATUS", status: "error" });
      throw new Error(i18n.t("workflowBuilder.errors.saveFailed", { ns: "common" }));
    } finally {
      savingRef.current = false;
    }
  }, [context, repository, dispatchRaw, flushHistoryBatch]);

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
    if (batchBaseRef.current) flushHistoryBatch();
    const issues = runFullValidation();
    if (issues.some((issue) => issue.severity === "error")) {
      throw new Error(i18n.t("workflowBuilder.publish.error", { ns: "common" }));
    }
    dispatchRaw({ type: "SET_SAVE_STATUS", status: "publishing" });
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
      dispatchRaw({ type: "SET_SAVE_STATUS", status: "error" });
      throw error;
    }
  }, [context, repository, runFullValidation, dispatchRaw, flushHistoryBatch]);

  const rollback = useCallback(
    async (targetVersionNumber: number) => {
      const saved = await repository.rollback(context, state.document.flowId, targetVersionNumber);
      const next = createHistoryState(createInitialBuilderState(saved));
      setHistory(next);
      builderSessionCache.set(saved.flowId, next);
      topologySigRef.current = "";
      configSigRef.current = "";
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

  const registerCanvasFocusHandler = useCallback((handler: (issue: ValidationIssue) => void) => {
    focusValidationIssueRef.current = handler;
  }, []);

  const focusValidationIssue = useCallback((issue: ValidationIssue) => {
    focusValidationIssueRef.current(issue);
  }, []);

  const openValidationPanel = useCallback(() => {
    dispatch({ type: "REQUEST_VALIDATION_PANEL_FOCUS" });
    const issues = state.validationIssues;
    const firstIssue = issues.find((issue) => issue.severity === "error") ?? issues[0];
    if (firstIssue) {
      dispatch({ type: "SET_ACTIVE_VALIDATION_ISSUE", issueId: firstIssue.id });
      focusValidationIssueRef.current(firstIssue);
    }
  }, [dispatch, state.validationIssues]);

  const undo = useCallback(() => {
    if (batchBaseRef.current) flushHistoryBatch();
    setHistory((current) => undoHistory(current));
  }, [flushHistoryBatch]);

  const redo = useCallback(() => {
    if (batchBaseRef.current) flushHistoryBatch();
    setHistory((current) => redoHistory(current));
  }, [flushHistoryBatch]);

  return useMemo(
    () => ({
      state,
      dispatch,
      updateNodeConfig,
      setMetadata,
      addNode,
      insertNodeAfter,
      duplicateSelected,
      alignSelected,
      applyAutoLayout,
      persist,
      publish,
      rollback,
      hasUnsavedChanges,
      runValidation: runFullValidation,
      registerCanvasFocusHandler,
      focusValidationIssue,
      openValidationPanel,
      undo,
      redo,
      canUndo: canUndo(history),
      canRedo: canRedo(history),
    }),
    [
      state,
      dispatch,
      updateNodeConfig,
      setMetadata,
      addNode,
      insertNodeAfter,
      duplicateSelected,
      alignSelected,
      applyAutoLayout,
      persist,
      publish,
      rollback,
      hasUnsavedChanges,
      runFullValidation,
      registerCanvasFocusHandler,
      focusValidationIssue,
      openValidationPanel,
      undo,
      redo,
      history,
    ],
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
