export function selectionKey(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

/** Last non-empty canvas selection; survives toolbar focus loss. */
export const lastKnownCanvasSelectionRef: { current: string[] } = { current: [] };

export function readDomSelectedNodeIds(): string[] {
  if (typeof window === "undefined") return [];
  return [...window.document.querySelectorAll(".react-flow__node.selected")]
    .map((element) => element.getAttribute("data-id") ?? "")
    .filter(Boolean);
}

export function rememberCanvasSelection(nodeIds: readonly string[]) {
  if (nodeIds.length > 0) {
    lastKnownCanvasSelectionRef.current = [...nodeIds];
  }
}

/** Resolve selected node ids for alignment after toolbar focus steals RF/DOM selection. */
export function resolveAlignmentSelection(
  documentNodeIds: ReadonlySet<string>,
  minRequired: number,
  sources: {
    override?: string[];
    builderSelected: string[];
    lastKnown: string[];
    domSelected: string[];
    liveSelected: string[];
  },
): string[] {
  const candidates = [
    sources.override,
    sources.builderSelected,
    sources.lastKnown,
    sources.domSelected,
    sources.liveSelected,
  ];

  let best: string[] = [];
  for (const ids of candidates) {
    if (!ids?.length) continue;
    const valid = [...new Set(ids)].filter((id) => documentNodeIds.has(id));
    if (valid.length >= minRequired) return valid;
    if (valid.length > best.length) best = valid;
  }

  return best.length >= minRequired ? best : [];
}
