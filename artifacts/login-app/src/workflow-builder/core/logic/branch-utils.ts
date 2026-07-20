import type { BuilderBranchKey, BuilderEdge, BuilderNode } from "../types";

const SWITCH_BRANCH_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
];

export function resolveBranchEdgeStyle(
  sourceNode: BuilderNode | undefined,
  edge: BuilderEdge,
): { stroke: string; label?: string } {
  if (sourceNode?.type === "if_else") {
    if (edge.branchKey === "yes") return { stroke: "#22c55e", label: edge.branchLabel ?? "YES" };
    if (edge.branchKey === "no") return { stroke: "#ef4444", label: edge.branchLabel ?? "NO" };
  }

  if (sourceNode?.type === "switch") {
    const cases = Array.isArray(sourceNode.config.cases)
      ? (sourceNode.config.cases as Array<{ id?: string; label?: string }>)
      : [];
    const index = cases.findIndex((item) => item.id === edge.branchKey);
    const color = SWITCH_BRANCH_COLORS[(index >= 0 ? index : 0) % SWITCH_BRANCH_COLORS.length]!;
    if (edge.branchKey === "default") return { stroke: "#64748b", label: edge.branchLabel ?? "Default" };
    const matched = cases.find((item) => item.id === edge.branchKey);
    return { stroke: color, label: edge.branchLabel ?? matched?.label ?? String(edge.branchKey ?? "Case") };
  }

  return { stroke: "hsl(var(--primary))" };
}

export function assignBranchForNewEdge(
  sourceNode: BuilderNode | undefined,
  existingEdges: BuilderEdge[],
): Partial<Pick<BuilderEdge, "branchKey" | "branchLabel">> {
  if (!sourceNode) return {};

  if (sourceNode.type === "if_else") {
    const used = new Set(existingEdges.filter((edge) => edge.source === sourceNode.id).map((edge) => edge.branchKey));
    if (!used.has("yes")) return { branchKey: "yes", branchLabel: "YES" };
    if (!used.has("no")) return { branchKey: "no", branchLabel: "NO" };
    return {};
  }

  if (sourceNode.type === "switch") {
    const cases = Array.isArray(sourceNode.config.cases)
      ? (sourceNode.config.cases as Array<{ id?: string; label?: string; value?: unknown }>)
      : [];
    const used = new Set(existingEdges.filter((edge) => edge.source === sourceNode.id).map((edge) => edge.branchKey));
    const nextCase = cases.find((item) => item.id && !used.has(item.id));
    if (nextCase?.id) return { branchKey: nextCase.id, branchLabel: nextCase.label ?? String(nextCase.value ?? "Case") };
    if (sourceNode.config.includeDefault !== false && !used.has("default")) {
      return { branchKey: "default", branchLabel: "Default" };
    }
  }

  return {};
}

export function normalizeVariableField(token: string): string {
  return token.replace(/^\{\{|\}\}$/g, "").trim();
}

export function isBinaryBranchKey(branchKey?: BuilderBranchKey): branchKey is "yes" | "no" {
  return branchKey === "yes" || branchKey === "no";
}
