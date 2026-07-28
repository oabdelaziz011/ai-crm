import { memo, useLayoutEffect, useMemo, useRef } from "react";
import type { Node } from "@xyflow/react";
import {
  documentEdgePresentationSignature,
  documentPresentationSignature,
  documentValidationSignature,
  resolveNodePresentationLabel,
  resolveNodePresentationSubtitle,
} from "../../core/canvas/document-signatures";
import type { BuilderEdge, BuilderNode } from "../../core/types";
import type { StructuralCanvasNode } from "../../core/canvas/flow-document-bridge";
import { resolveBranchEdgeStyle } from "../../core/logic/branch-utils";
import { buildValidationHighlightIndex } from "../../core/validation/path-validation";
import { useWorkflowBuilderI18n } from "@/workflow-builder/hooks/use-workflow-builder-i18n";
import {
  usePresentationNodes,
  useValidationBuilderSlice,
} from "../../context/workflow-builder-context";
import type { WorkflowNodeData } from "../nodes/workflow-node-card";
import {
  applyEdgePresentationPatch,
  type ValidationHighlightIndex,
  type WorkflowFlowEdge,
} from "./canvas-edge-sync";

function localizeDefaultBranchLabel(
  label: string,
  branchLabel: (key: string, fallback?: string) => string,
): string {
  if (label === "Default") return branchLabel("default", label);
  if (label === "Case") return branchLabel("case", label);
  if (label === "No") return branchLabel("no", label);
  if (label === "Yes") return branchLabel("yes", label);
  return label;
}

export type CanvasNodePresentationPatcher = {
  patchPresentation: (
    nodes: BuilderNode[],
    nodeText: (nodeId: string, field: "displayName" | "description", fallback: string) => string,
  ) => void;
};

export type CanvasNodeValidationPatcher = {
  patchValidation: (highlight: ValidationHighlightIndex) => void;
};

export type CanvasEdgePresentationPatcher = {
  patchEdgePresentation: (localizedLabelById: Map<string, string>) => void;
};

export type CanvasEdgeValidationPatcher = {
  patchEdgeValidation: (highlight: ValidationHighlightIndex) => void;
};

export const CanvasPresentationSync = memo(function CanvasPresentationSync({
  patchRef,
}: {
  patchRef: React.MutableRefObject<CanvasNodePresentationPatcher | null>;
}) {
  const presentationNodes = usePresentationNodes();
  const { nodeText } = useWorkflowBuilderI18n();
  const presentationSignature = useMemo(
    () => documentPresentationSignature(presentationNodes, nodeText),
    [presentationNodes, nodeText],
  );
  const presentationNodesRef = useRef(presentationNodes);
  presentationNodesRef.current = presentationNodes;
  const nodeTextRef = useRef(nodeText);
  nodeTextRef.current = nodeText;

  useLayoutEffect(() => {
    patchRef.current?.patchPresentation(presentationNodesRef.current, nodeTextRef.current);
  }, [presentationSignature, patchRef]);

  return null;
});

export const CanvasValidationSync = memo(function CanvasValidationSync({
  patchRef,
}: {
  patchRef: React.MutableRefObject<CanvasNodeValidationPatcher | null>;
}) {
  const { validationIssues, activeValidationIssueId } = useValidationBuilderSlice();
  const validationSignature = useMemo(
    () => documentValidationSignature(validationIssues, activeValidationIssueId),
    [validationIssues, activeValidationIssueId],
  );
  const highlight = useMemo(
    () => buildValidationHighlightIndex(validationIssues, activeValidationIssueId),
    [validationIssues, activeValidationIssueId],
  );
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;

  useLayoutEffect(() => {
    patchRef.current?.patchValidation(highlightRef.current);
  }, [validationSignature, patchRef]);

  return null;
});

export const CanvasEdgePresentationSync = memo(function CanvasEdgePresentationSync({
  patchRef,
  structuralNodes,
  edges,
}: {
  patchRef: React.MutableRefObject<CanvasEdgePresentationPatcher | null>;
  structuralNodes: StructuralCanvasNode[];
  edges: BuilderEdge[];
}) {
  const { branchLabel } = useWorkflowBuilderI18n();
  const localize = useMemo(
    () => (rawLabel: string) => localizeDefaultBranchLabel(rawLabel, branchLabel),
    [branchLabel],
  );
  const edgePresentationSignature = useMemo(
    () => documentEdgePresentationSignature(structuralNodes, edges, localize),
    [structuralNodes, edges, localize],
  );
  const localizedLabelById = useMemo(() => {
    const nodesById = new Map(structuralNodes.map((node) => [node.id, node.type]));
    return new Map(
      edges.map((edge) => {
        const style = resolveBranchEdgeStyle(nodesById.get(edge.source), edge);
        return [edge.id, localize(style.label ?? "")] as const;
      }),
    );
  }, [structuralNodes, edges, localize]);
  const localizedRef = useRef(localizedLabelById);
  localizedRef.current = localizedLabelById;

  useLayoutEffect(() => {
    patchRef.current?.patchEdgePresentation(localizedRef.current);
  }, [edgePresentationSignature, patchRef]);

  return null;
});

export const CanvasEdgeValidationSync = memo(function CanvasEdgeValidationSync({
  patchRef,
}: {
  patchRef: React.MutableRefObject<CanvasEdgeValidationPatcher | null>;
}) {
  const { validationIssues, activeValidationIssueId } = useValidationBuilderSlice();
  const validationSignature = useMemo(
    () => documentValidationSignature(validationIssues, activeValidationIssueId),
    [validationIssues, activeValidationIssueId],
  );
  const highlight = useMemo(
    () => buildValidationHighlightIndex(validationIssues, activeValidationIssueId),
    [validationIssues, activeValidationIssueId],
  );
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;

  useLayoutEffect(() => {
    patchRef.current?.patchEdgeValidation(highlightRef.current);
  }, [validationSignature, patchRef]);

  return null;
});

export function patchNodePresentationData(
  current: Node<WorkflowNodeData>[],
  presentationNodes: BuilderNode[],
  nodeText: (nodeId: string, field: "displayName" | "description", fallback: string) => string,
): Node<WorkflowNodeData>[] {
  const labelById = new Map(
    presentationNodes.map((node) => [node.id, resolveNodePresentationLabel(node, nodeText)]),
  );
  const subtitleById = new Map(
    presentationNodes.map((node) => [node.id, resolveNodePresentationSubtitle(node)]),
  );
  let changed = false;
  const next = current.map((node) => {
    const label = labelById.get(node.id) ?? "";
    const subtitle = subtitleById.get(node.id) ?? "";
    if (node.data.label === label && (node.data.subtitle ?? "") === subtitle) return node;
    changed = true;
    return { ...node, data: { ...node.data, label, subtitle } };
  });
  return changed ? next : current;
}

export function patchNodeValidationData(
  current: Node<WorkflowNodeData>[],
  highlight: ValidationHighlightIndex,
): Node<WorkflowNodeData>[] {
  let changed = false;
  const next = current.map((node) => {
    const validationSeverity = highlight.nodeSeverity.get(node.id);
    const validationActive = highlight.activeNodeIds.has(node.id);
    if (node.data.validationSeverity === validationSeverity && node.data.validationActive === validationActive) {
      return node;
    }
    changed = true;
    return { ...node, data: { ...node.data, validationSeverity, validationActive } };
  });
  return changed ? next : current;
}

export function patchEdgePresentationData(
  edges: WorkflowFlowEdge[],
  localizedLabelById: Map<string, string>,
): WorkflowFlowEdge[] {
  return applyEdgePresentationPatch(edges, localizedLabelById);
}
