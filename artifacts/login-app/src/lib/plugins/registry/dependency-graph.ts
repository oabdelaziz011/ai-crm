import type { DependencyGraphNode, PluginManifest } from "@/lib/plugins/types";

export function buildDependencyGraph(manifests: PluginManifest[]): DependencyGraphNode[] {
  const nodes = new Map<string, DependencyGraphNode>();

  for (const m of manifests) {
    nodes.set(m.pluginId, { pluginId: m.pluginId, dependencies: [...m.dependencies], dependents: [] });
  }

  for (const m of manifests) {
    for (const dep of m.dependencies) {
      const depNode = nodes.get(dep);
      if (depNode) depNode.dependents.push(m.pluginId);
    }
  }

  return [...nodes.values()];
}

export function validateDependencies(
  pluginId: string,
  dependencies: string[],
  installedIds: Set<string>,
): { valid: boolean; missing: string[] } {
  const missing = dependencies.filter((d) => !installedIds.has(d));
  return { valid: missing.length === 0, missing };
}

export function topologicalSort(manifests: PluginManifest[]): PluginManifest[] {
  const graph = buildDependencyGraph(manifests);
  const sorted: PluginManifest[] = [];
  const visited = new Set<string>();
  const manifestMap = new Map(manifests.map((m) => [m.pluginId, m]));

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = graph.find((n) => n.pluginId === id);
    for (const dep of node?.dependencies ?? []) visit(dep);
    const m = manifestMap.get(id);
    if (m) sorted.push(m);
  }

  for (const m of manifests) visit(m.pluginId);
  return sorted;
}

export function detectCycles(manifests: PluginManifest[]): string[] {
  const graph = buildDependencyGraph(manifests);
  const cycles: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(id: string, path: string[]) {
    if (visiting.has(id)) {
      cycles.push([...path, id].join(" → "));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const node = graph.find((n) => n.pluginId === id);
    for (const dep of node?.dependencies ?? []) dfs(dep, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const m of manifests) dfs(m.pluginId, []);
  return cycles;
}
