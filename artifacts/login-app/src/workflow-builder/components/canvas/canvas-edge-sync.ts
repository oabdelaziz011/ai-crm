import type { Edge } from "@xyflow/react";
import type { WorkflowEdgeData, WorkflowFlowEdge } from "../../core/canvas/flow-document-bridge";

export function seedControlledEdgesFromDocument(
  current: WorkflowFlowEdge[],
  projected: WorkflowFlowEdge[],
): WorkflowFlowEdge[] {
  if (current.length !== projected.length) {
    return projected;
  }

  const currentById = new Map(current.map((edge) => [edge.id, edge]));
  let changed = false;
  const next: WorkflowFlowEdge[] = [];

  for (const projectedEdge of projected) {
    const existing = currentById.get(projectedEdge.id);
    if (!existing) {
      return projected;
    }

    const structuralUnchanged =
      existing.source === projectedEdge.source &&
      existing.target === projectedEdge.target &&
      existing.sourceHandle === projectedEdge.sourceHandle &&
      existing.targetHandle === projectedEdge.targetHandle &&
      existing.selected === projectedEdge.selected &&
      existing.data?.branchKey === projectedEdge.data?.branchKey &&
      existing.data?.branchLabel === projectedEdge.data?.branchLabel &&
      existing.data?.sourceNodeType === projectedEdge.data?.sourceNodeType &&
      existing.data?.baseStroke === projectedEdge.data?.baseStroke;

    if (structuralUnchanged) {
      next.push(existing);
      continue;
    }

    changed = true;
    next.push({
      ...existing,
      source: projectedEdge.source,
      target: projectedEdge.target,
      sourceHandle: projectedEdge.sourceHandle,
      targetHandle: projectedEdge.targetHandle,
      selected: projectedEdge.selected,
      selectable: projectedEdge.selectable ?? true,
      focusable: projectedEdge.focusable ?? true,
      interactionWidth: projectedEdge.interactionWidth ?? 28,
      animated: projectedEdge.animated,
      labelStyle: projectedEdge.labelStyle,
      style: projectedEdge.style,
      data: projectedEdge.data,
    });
  }

  return changed ? next : current;
}

export type ValidationHighlightIndex = {
  nodeSeverity: Map<string, "error" | "warning">;
  edgeIds: Set<string>;
  activeNodeIds: Set<string>;
  activeEdgeIds: Set<string>;
};

export function applyEdgeValidationPatch(
  edges: WorkflowFlowEdge[],
  highlight: ValidationHighlightIndex,
): WorkflowFlowEdge[] {
  let changed = false;
  const next = edges.map((edge) => {
    const baseStroke = edge.data?.baseStroke ?? "hsl(var(--primary))";
    const isValidationEdge = highlight.edgeIds.has(edge.id);
    const isActiveValidationEdge = highlight.activeEdgeIds.has(edge.id);
    const selectedStroke = "#0ea5e9";
    const validationStroke = isActiveValidationEdge
      ? "#ef4444"
      : isValidationEdge
        ? "#f87171"
        : edge.selected
          ? selectedStroke
          : baseStroke;
    const validationStrokeWidth = isActiveValidationEdge
      ? 3.5
      : isValidationEdge
        ? 3
        : edge.selected
          ? 3.5
          : 2.5;
    const validationStrokeDasharray = isValidationEdge ? "6 4" : undefined;
    const animated = !isValidationEdge && !edge.selected;

    const nextStyle = {
      strokeWidth: validationStrokeWidth,
      stroke: validationStroke,
      ...(validationStrokeDasharray ? { strokeDasharray: validationStrokeDasharray } : {}),
    };
    const nextLabelStyle = { fill: validationStroke, fontWeight: 600 as const };

    const styleChanged =
      edge.style?.stroke !== nextStyle.stroke ||
      edge.style?.strokeWidth !== nextStyle.strokeWidth ||
      edge.style?.strokeDasharray !== nextStyle.strokeDasharray;
    const labelStyleChanged =
      edge.labelStyle?.fill !== nextLabelStyle.fill || edge.animated !== animated;

    if (!styleChanged && !labelStyleChanged) return edge;
    changed = true;
    return {
      ...edge,
      animated,
      labelStyle: nextLabelStyle,
      style: nextStyle,
    };
  });
  return changed ? next : edges;
}

export function applyEdgePresentationPatch(
  edges: WorkflowFlowEdge[],
  localizedLabelById: Map<string, string>,
): WorkflowFlowEdge[] {
  let changed = false;
  const next = edges.map((edge) => {
    const localizedLabel = localizedLabelById.get(edge.id) ?? edge.label ?? "";
    if (edge.label === localizedLabel) return edge;
    changed = true;
    return { ...edge, label: localizedLabel };
  });
  return changed ? next : edges;
}

export function buildLocalizedEdgeLabels(
  edges: WorkflowFlowEdge[],
  localizeBranchLabel: (rawLabel: string) => string,
): Map<string, string> {
  return new Map(
    edges.map((edge) => [edge.id, localizeBranchLabel(String(edge.label ?? edge.data?.branchLabel ?? ""))]),
  );
}

export type { WorkflowFlowEdge };
