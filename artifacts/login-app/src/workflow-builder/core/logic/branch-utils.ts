import type { BuilderBranchKey, BuilderEdge, BuilderNode, BuilderNodeType } from "../types";

const SWITCH_BRANCH_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
];

const switchBranchColorCache = new Map<string, string>();

function hashBranchKey(branchKey: string): number {
  let hash = 0;
  for (let index = 0; index < branchKey.length; index += 1) {
    hash = (hash * 31 + branchKey.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** Cached deterministic switch branch color from branchKey. */
export function getSwitchBranchColor(branchKey: string): string {
  const cached = switchBranchColorCache.get(branchKey);
  if (cached) return cached;
  const color = SWITCH_BRANCH_COLORS[hashBranchKey(branchKey) % SWITCH_BRANCH_COLORS.length]!;
  switchBranchColorCache.set(branchKey, color);
  return color;
}

/** Edge styling from structural fields only — branchKey, branchLabel, source node type. */
export function resolveBranchEdgeStyle(
  sourceNodeType: BuilderNodeType | undefined,
  edge: BuilderEdge,
): { stroke: string; label?: string } {
  if (sourceNodeType === "if_else") {
    if (edge.branchKey === "yes") return { stroke: "#22c55e", label: edge.branchLabel ?? "YES" };
    if (edge.branchKey === "no") return { stroke: "#ef4444", label: edge.branchLabel ?? "NO" };
  }

  if (sourceNodeType === "switch") {
    if (edge.branchKey === "default") return { stroke: "#64748b", label: edge.branchLabel ?? "Default" };
    const branchKey = edge.branchKey ?? "";
    return {
      stroke: getSwitchBranchColor(branchKey),
      label: edge.branchLabel ?? (branchKey || "Case"),
    };
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
