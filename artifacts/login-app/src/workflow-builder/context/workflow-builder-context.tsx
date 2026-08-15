import {
  createContext,
  memo,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { BuilderEdge, BuilderNode, BuilderViewport, ValidationIssue, WorkflowDocument } from "../core/types";
import type { WorkflowBuilderController } from "../hooks/use-workflow-builder";
import { documentTopologySignature } from "../core/canvas/document-signatures";
import { buildSwitchBranchPorts } from "../core/logic/branch-utils";

export type CanvasBuilderSlice = {
  flowId: string;
  nodes: Array<
    Pick<BuilderNode, "id" | "type" | "position"> & {
      branchPorts?: Array<{ key: string; label: string }>;
    }
  >;
  edges: BuilderEdge[];
  viewport: BuilderViewport;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  validationIssues: ValidationIssue[];
  activeValidationIssueId: string | null;
  layoutAnimationEnabled: boolean;
  readOnly: boolean;
};

export type DocumentBuilderSlice = {
  document: WorkflowDocument;
  selectedNodeIds: string[];
};

export type ValidationBuilderSlice = {
  validationIssues: ValidationIssue[];
  activeValidationIssueId: string | null;
  validationPanelFocusNonce: number;
};

export type HistoryBuilderSlice = {
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: WorkflowBuilderController["state"]["saveStatus"];
  hasUnsavedChanges: boolean;
};

type BuilderActionsContextValue = Omit<WorkflowBuilderController, "state" | "canUndo" | "canRedo" | "hasUnsavedChanges">;

const CanvasSliceContext = createContext<CanvasBuilderSlice | null>(null);
const DocumentSliceContext = createContext<DocumentBuilderSlice | null>(null);
const ValidationSliceContext = createContext<ValidationBuilderSlice | null>(null);
const HistorySliceContext = createContext<HistoryBuilderSlice | null>(null);
const BuilderActionsContext = createContext<BuilderActionsContextValue | null>(null);

function buildCanvasSlice(controller: WorkflowBuilderController): CanvasBuilderSlice {
  const {
    document,
    selectedNodeIds,
    selectedEdgeIds,
    validationIssues,
    activeValidationIssueId,
    layoutAnimationEnabled,
  } = controller.state;
  return {
    flowId: document.flowId,
    nodes: document.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      ...(node.type === "switch" ? { branchPorts: buildSwitchBranchPorts(node.config) } : {}),
    })),
    edges: document.edges,
    viewport: document.viewport,
    selectedNodeIds,
    selectedEdgeIds,
    validationIssues,
    activeValidationIssueId,
    layoutAnimationEnabled,
    readOnly: document.readOnly === true,
  };
}

function canvasSliceSignature(slice: CanvasBuilderSlice): string {
  const topology = documentTopologySignature({ nodes: slice.nodes as BuilderNode[], edges: slice.edges });
  const selection = slice.selectedNodeIds.join(",");
  const edgeSelection = slice.selectedEdgeIds.join(",");
  const branchPorts = slice.nodes
    .map((node) =>
      node.branchPorts?.length
        ? `${node.id}:${node.branchPorts.map((port) => `${port.key}=${port.label}`).join(",")}`
        : "",
    )
    .filter(Boolean)
    .join("|");
  // Viewport is excluded: continuous pan/zoom must not rebuild the canvas slice
  // (that remounts projections and can infinite-loop with controlled RF nodes).
  // Keep layoutAnimationEnabled out of the canvas slice signature — toggling it on
  // drag-end was rebuilding the slice and re-entering seed during RF updates.
  return `${slice.flowId}|${topology}|${branchPorts}|${selection}|${edgeSelection}|${slice.readOnly ? 1 : 0}`;
}

function DocumentSliceProvider({
  controller,
  children,
}: {
  controller: WorkflowBuilderController;
  children: ReactNode;
}) {
  const value = useMemo(
    (): DocumentBuilderSlice => ({
      document: controller.state.document,
      selectedNodeIds: controller.state.selectedNodeIds,
    }),
    [controller.state.document, controller.state.selectedNodeIds],
  );
  return <DocumentSliceContext.Provider value={value}>{children}</DocumentSliceContext.Provider>;
}

function ValidationSliceProvider({
  controller,
  children,
}: {
  controller: WorkflowBuilderController;
  children: ReactNode;
}) {
  const value = useMemo(
    (): ValidationBuilderSlice => ({
      validationIssues: controller.state.validationIssues,
      activeValidationIssueId: controller.state.activeValidationIssueId,
      validationPanelFocusNonce: controller.state.validationPanelFocusNonce,
    }),
    [
      controller.state.validationIssues,
      controller.state.activeValidationIssueId,
      controller.state.validationPanelFocusNonce,
    ],
  );
  return <ValidationSliceContext.Provider value={value}>{children}</ValidationSliceContext.Provider>;
}

function HistorySliceProvider({
  controller,
  children,
}: {
  controller: WorkflowBuilderController;
  children: ReactNode;
}) {
  const value = useMemo(
    (): HistoryBuilderSlice => ({
      canUndo: controller.canUndo,
      canRedo: controller.canRedo,
      saveStatus: controller.state.saveStatus,
      hasUnsavedChanges: controller.hasUnsavedChanges,
    }),
    [controller.canUndo, controller.canRedo, controller.state.saveStatus, controller.hasUnsavedChanges],
  );
  return <HistorySliceContext.Provider value={value}>{children}</HistorySliceContext.Provider>;
}

const CanvasSliceProvider = memo(function CanvasSliceProvider({
  controller,
  children,
}: {
  controller: WorkflowBuilderController;
  children: ReactNode;
}) {
  const signatureRef = useRef("");
  const sliceRef = useRef<CanvasBuilderSlice>(buildCanvasSlice(controller));

  const nextSlice = buildCanvasSlice(controller);
  const nextSignature = canvasSliceSignature(nextSlice);
  if (nextSignature !== signatureRef.current) {
    signatureRef.current = nextSignature;
    sliceRef.current = nextSlice;
  }

  return <CanvasSliceContext.Provider value={sliceRef.current}>{children}</CanvasSliceContext.Provider>;
});

function BuilderActionsProvider({
  controller,
  children,
}: {
  controller: WorkflowBuilderController;
  children: ReactNode;
}) {
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  const actions = useMemo(
    (): BuilderActionsContextValue => ({
      dispatch: (action) => controllerRef.current.dispatch(action),
      addNode: (...args) => controllerRef.current.addNode(...args),
      insertNodeAfter: (...args) => controllerRef.current.insertNodeAfter(...args),
      duplicateSelected: () => controllerRef.current.duplicateSelected(),
      alignSelected: (...args) => controllerRef.current.alignSelected(...args),
      applyAutoLayout: () => controllerRef.current.applyAutoLayout(),
      persist: () => controllerRef.current.persist(),
      publish: (...args) => controllerRef.current.publish(...args),
      rollback: (...args) => controllerRef.current.rollback(...args),
      runValidation: () => controllerRef.current.runValidation(),
      registerCanvasFocusHandler: (...args) => controllerRef.current.registerCanvasFocusHandler(...args),
      focusValidationIssue: (...args) => controllerRef.current.focusValidationIssue(...args),
      openValidationPanel: () => controllerRef.current.openValidationPanel(),
      undo: () => controllerRef.current.undo(),
      redo: () => controllerRef.current.redo(),
      updateNodeConfig: (...args) => controllerRef.current.updateNodeConfig(...args),
      setMetadata: (...args) => controllerRef.current.setMetadata(...args),
    }),
    [],
  );

  return <BuilderActionsContext.Provider value={actions}>{children}</BuilderActionsContext.Provider>;
}

export function WorkflowBuilderProvider({
  controller,
  children,
}: {
  controller: WorkflowBuilderController;
  children: ReactNode;
}) {
  return (
    <BuilderActionsProvider controller={controller}>
      <CanvasSliceProvider controller={controller}>
        <DocumentSliceProvider controller={controller}>
          <ValidationSliceProvider controller={controller}>
            <HistorySliceProvider controller={controller}>{children}</HistorySliceProvider>
          </ValidationSliceProvider>
        </DocumentSliceProvider>
      </CanvasSliceProvider>
    </BuilderActionsProvider>
  );
}

export function useBuilderActions() {
  const context = useContext(BuilderActionsContext);
  if (!context) throw new Error("useBuilderActions must be used within WorkflowBuilderProvider");
  return context;
}

export function useCanvasBuilderSlice() {
  const context = useContext(CanvasSliceContext);
  if (!context) throw new Error("useCanvasBuilderSlice must be used within WorkflowBuilderProvider");
  return context;
}

export function useDocumentBuilderSlice() {
  const context = useContext(DocumentSliceContext);
  if (!context) throw new Error("useDocumentBuilderSlice must be used within WorkflowBuilderProvider");
  return context;
}

export function useValidationBuilderSlice() {
  const context = useContext(ValidationSliceContext);
  if (!context) throw new Error("useValidationBuilderSlice must be used within WorkflowBuilderProvider");
  return context;
}

export function useHistoryBuilderSlice() {
  const context = useContext(HistorySliceContext);
  if (!context) throw new Error("useHistoryBuilderSlice must be used within WorkflowBuilderProvider");
  return context;
}

/** Full document nodes for presentation patching — updates without structural canvas invalidation. */
export function usePresentationNodes(): BuilderNode[] {
  return useDocumentBuilderSlice().document.nodes;
}

export function useLayoutAnimationEnabled(): boolean {
  return useCanvasBuilderSlice().layoutAnimationEnabled;
}
