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

export type SwitchCaseLike = {
  id?: string;
  label?: string;
  value?: unknown;
};

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

/**
 * Canonical Switch branch key = case value (unique, ordered in the cases list).
 * Falls back to case id when value is empty (legacy / incomplete drafts).
 */
export function switchCaseBranchKey(item: SwitchCaseLike | null | undefined): string | null {
  if (!item) return null;
  const value = item.value == null ? "" : String(item.value).trim();
  if (value) return value;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  return id || null;
}

export function switchCaseBranchLabel(item: SwitchCaseLike | null | undefined): string {
  if (!item) return "Case";
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const key = switchCaseBranchKey(item);
  return label || key || "Case";
}

export function readSwitchCases(config: Record<string, unknown> | undefined): SwitchCaseLike[] {
  if (!config || !Array.isArray(config.cases)) return [];
  return config.cases as SwitchCaseLike[];
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
    const cases = readSwitchCases(sourceNode.config);
    const used = new Set(existingEdges.filter((edge) => edge.source === sourceNode.id).map((edge) => edge.branchKey));
    // Assign in cases-array order (= value order shown in the Switch editor).
    const nextCase = cases.find((item) => {
      const key = switchCaseBranchKey(item);
      return Boolean(key) && !used.has(key!);
    });
    if (nextCase) {
      const branchKey = switchCaseBranchKey(nextCase)!;
      return { branchKey, branchLabel: switchCaseBranchLabel(nextCase) };
    }
    if (sourceNode.config.includeDefault !== false && !used.has("default")) {
      return { branchKey: "default", branchLabel: "Default" };
    }
  }

  return {};
}

/** Resolve branch for a new edge, optionally forced by a Switch case handle (`case:value`). */
export function resolveBranchForConnection(
  sourceNode: BuilderNode | undefined,
  existingEdges: BuilderEdge[],
  requestedBranchKey?: string,
): Partial<Pick<BuilderEdge, "branchKey" | "branchLabel">> {
  if (!sourceNode) return {};

  if (sourceNode.type === "switch" && requestedBranchKey) {
    const used = existingEdges.some(
      (edge) => edge.source === sourceNode.id && edge.branchKey === requestedBranchKey,
    );
    if (used) return {};

    if (requestedBranchKey === "default") {
      if (sourceNode.config.includeDefault === false) return {};
      return { branchKey: "default", branchLabel: "Default" };
    }

    const match = readSwitchCases(sourceNode.config).find(
      (item) => switchCaseBranchKey(item) === requestedBranchKey,
    );
    if (!match) return {};
    return { branchKey: requestedBranchKey, branchLabel: switchCaseBranchLabel(match) };
  }

  if (sourceNode.type === "if_else" && requestedBranchKey) {
    if (requestedBranchKey !== "yes" && requestedBranchKey !== "no") return {};
    const used = existingEdges.some(
      (edge) => edge.source === sourceNode.id && edge.branchKey === requestedBranchKey,
    );
    if (used) return {};
    return {
      branchKey: requestedBranchKey,
      branchLabel: requestedBranchKey === "yes" ? "YES" : "NO",
    };
  }

  return assignBranchForNewEdge(sourceNode, existingEdges);
}

export type SwitchBranchPort = {
  key: string;
  label: string;
};

/** Source handles for a Switch node — one per case value, then Default. */
export function buildSwitchBranchPorts(config: Record<string, unknown> | undefined): SwitchBranchPort[] {
  const ports: SwitchBranchPort[] = [];
  for (const item of readSwitchCases(config)) {
    const key = switchCaseBranchKey(item);
    if (!key) continue;
    ports.push({ key, label: switchCaseBranchLabel(item) });
  }
  if (!config || config.includeDefault !== false) {
    ports.push({ key: "default", label: "Default" });
  }
  return ports;
}

export function switchCaseSourceHandleId(branchKey: string): string {
  return `case:${branchKey}`;
}

export function parseSwitchCaseSourceHandle(handleId: string | null | undefined): string | undefined {
  if (!handleId || !handleId.startsWith("case:")) return undefined;
  const key = handleId.slice("case:".length).trim();
  return key || undefined;
}

/**
 * Keep Switch outgoing edges aligned with case values (order + keys).
 * Migrates legacy edges keyed by case.id → case.value, and remaps renamed values.
 */
export function syncSwitchOutgoingEdges(
  switchNodeId: string,
  previousCases: SwitchCaseLike[],
  nextCases: SwitchCaseLike[],
  edges: BuilderEdge[],
  createEdgeId: (source: string, target: string, branchKey?: string) => string,
): BuilderEdge[] {
  const previousById = new Map(
    previousCases.filter((item) => typeof item.id === "string" && item.id.trim()).map((item) => [item.id!.trim(), item]),
  );
  const nextById = new Map(
    nextCases.filter((item) => typeof item.id === "string" && item.id.trim()).map((item) => [item.id!.trim(), item]),
  );
  const nextKeys = new Set(
    nextCases.map((item) => switchCaseBranchKey(item)).filter((key): key is string => Boolean(key)),
  );

  return edges.map((edge) => {
    if (edge.source !== switchNodeId) return edge;
    if (!edge.branchKey || edge.branchKey === "default") return edge;

    const previous = previousById.get(edge.branchKey);
    const nextSameId = typeof previous?.id === "string" ? nextById.get(previous.id) : undefined;

    // Legacy: edge keyed by case.id → rewrite to current value key.
    if (nextSameId) {
      const branchKey = switchCaseBranchKey(nextSameId);
      if (!branchKey) return edge;
      return {
        ...edge,
        id: createEdgeId(edge.source, edge.target, branchKey),
        branchKey,
        branchLabel: switchCaseBranchLabel(nextSameId),
      };
    }

    // Value renamed on the same case id while edge already used the old value.
    const previousByValue = previousCases.find((item) => switchCaseBranchKey(item) === edge.branchKey);
    if (previousByValue?.id) {
      const next = nextById.get(previousByValue.id);
      if (next) {
        const branchKey = switchCaseBranchKey(next);
        if (!branchKey) return edge;
        return {
          ...edge,
          id: createEdgeId(edge.source, edge.target, branchKey),
          branchKey,
          branchLabel: switchCaseBranchLabel(next),
        };
      }
    }

    // Already keyed by a current value — refresh label only.
    if (nextKeys.has(edge.branchKey)) {
      const match = nextCases.find((item) => switchCaseBranchKey(item) === edge.branchKey);
      if (!match) return edge;
      const label = switchCaseBranchLabel(match);
      if (edge.branchLabel === label) return edge;
      return { ...edge, branchLabel: label };
    }

    return edge;
  });
}

/** Normalize loaded Switch edges so branchKey uses case value (not legacy case id). */
export function normalizeSwitchEdgesForDocument(nodes: BuilderNode[], edges: BuilderEdge[], createEdgeId: (source: string, target: string, branchKey?: string) => string): BuilderEdge[] {
  let next = edges;
  for (const node of nodes) {
    if (node.type !== "switch") continue;
    const cases = readSwitchCases(node.config);
    next = syncSwitchOutgoingEdges(node.id, cases, cases, next, createEdgeId);
  }
  return next;
}

export function normalizeVariableField(token: string): string {
  return token.replace(/^\{\{|\}\}$/g, "").trim();
}

export function isBinaryBranchKey(branchKey?: BuilderBranchKey): branchKey is "yes" | "no" {
  return branchKey === "yes" || branchKey === "no";
}
