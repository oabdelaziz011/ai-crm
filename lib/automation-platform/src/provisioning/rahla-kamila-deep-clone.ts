/**
 * Pure deep-clone ID remapping for «رحلة كاملة» snapshots.
 * Used by unit tests to prove independence of remapped graphs.
 * SQL provisioner is the production SoT; this mirrors remapping rules.
 */

export type SnapshotNode = {
  id: string;
  type: string;
  config: Record<string, unknown>;
  positionX?: number;
  positionY?: number;
};

export type SnapshotEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition?: Record<string, unknown>;
};

export type WorkflowGraphSnapshotLike = {
  name?: string;
  description?: string;
  triggerType?: string;
  metadata?: Record<string, unknown>;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
};

export const RAHLA_KAMILA_ONE_TIME_CLONE_KEY = "rahla_kamila";

/** Deep-clone JSON so source and copy never share object references. */
export function deepCloneJson<T>(value: T): T {
  return structuredClone(value);
}

export type RemapResult = {
  snapshot: WorkflowGraphSnapshotLike;
  idMap: Record<string, string>;
  metadata: Record<string, unknown>;
};

/**
 * Remap all node/edge IDs. Does NOT keep parent/source references.
 * `newId` must return unique ids (injectable for tests).
 */
export function remapWorkflowSnapshotForCompanyClone(
  source: WorkflowGraphSnapshotLike,
  options: {
    newId: () => string;
    clonedAt?: string;
  },
): RemapResult {
  const idMap: Record<string, string> = {};
  const nodes: SnapshotNode[] = [];

  for (const node of source.nodes ?? []) {
    if (!node?.id) continue;
    const nextId = options.newId();
    idMap[node.id] = nextId;
    nodes.push({
      id: nextId,
      type: node.type,
      config: deepCloneJson(node.config ?? {}),
      positionX: node.positionX ?? 0,
      positionY: node.positionY ?? 0,
    });
  }

  const edges: SnapshotEdge[] = [];
  for (const edge of source.edges ?? []) {
    const sourceNodeId = idMap[edge.sourceNodeId];
    const targetNodeId = idMap[edge.targetNodeId];
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) continue;
    edges.push({
      id: options.newId(),
      sourceNodeId,
      targetNodeId,
      condition: deepCloneJson(edge.condition ?? {}),
    });
  }

  const baseMeta =
    source.metadata && typeof source.metadata === "object" ? deepCloneJson(source.metadata) : {};
  delete baseMeta.one_time_clone_key;
  delete baseMeta.one_time_cloned_at;
  delete baseMeta.parent_flow_id;
  delete baseMeta.source_flow_id;
  delete baseMeta.template_id;
  delete baseMeta.template_key;
  delete baseMeta.sync_from_template;

  const metadata: Record<string, unknown> = {
    ...baseMeta,
    one_time_clone_key: RAHLA_KAMILA_ONE_TIME_CLONE_KEY,
    one_time_cloned_at: options.clonedAt ?? new Date().toISOString(),
  };

  return {
    idMap,
    metadata,
    snapshot: {
      name: source.name,
      description: source.description,
      triggerType: source.triggerType,
      metadata,
      nodes,
      edges,
    },
  };
}

export function assertNoSharedIds(
  source: WorkflowGraphSnapshotLike,
  clone: WorkflowGraphSnapshotLike,
): void {
  const sourceNodeIds = new Set((source.nodes ?? []).map((n) => n.id));
  const sourceEdgeIds = new Set((source.edges ?? []).map((e) => e.id));
  for (const n of clone.nodes ?? []) {
    if (sourceNodeIds.has(n.id)) {
      throw new Error(`Clone reuses source node id ${n.id}`);
    }
  }
  for (const e of clone.edges ?? []) {
    if (sourceEdgeIds.has(e.id)) {
      throw new Error(`Clone reuses source edge id ${e.id}`);
    }
    if (sourceNodeIds.has(e.sourceNodeId) || sourceNodeIds.has(e.targetNodeId)) {
      throw new Error(`Clone edge still references source node ids`);
    }
  }
}
