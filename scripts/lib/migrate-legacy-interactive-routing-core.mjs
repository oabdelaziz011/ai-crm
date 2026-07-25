import { randomUUID } from "node:crypto";

export const SELECTION_FIELD = "conversation.last_button_id";
const INTERACTIVE_BUILDER_TYPES = new Set(["buttons", "list"]);
const INTERACTIVE_ACTIONS = new Set(["send_buttons", "send_list"]);

function readBuilderType(node) {
  return typeof node.config?.builderType === "string" ? node.config.builderType : null;
}

export function isInteractiveNode(node) {
  const builderType = readBuilderType(node);
  if (builderType && INTERACTIVE_BUILDER_TYPES.has(builderType)) return true;
  return node.type === "action" && INTERACTIVE_ACTIONS.has(node.config?.action);
}

function isIfElseNode(node) {
  if (readBuilderType(node) === "if_else") return true;
  return node.type === "condition" && node.config?.ruleSet != null && node.config?.mode !== "switch";
}

function isSwitchNode(node) {
  if (readBuilderType(node) === "switch") return true;
  return node.type === "condition" && node.config?.mode === "switch";
}

function readButtonOptions(config) {
  if (!Array.isArray(config?.buttons)) return [];
  return config.buttons.flatMap((entry) => {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    const label = typeof entry?.label === "string" ? entry.label.trim() : "";
    if (!id) return [];
    return [{ id, label: label || id }];
  });
}

function readListOptions(config) {
  if (Array.isArray(config?.rows)) {
    return config.rows.flatMap((entry) => {
      const id = typeof entry?.id === "string" ? entry.id.trim() : "";
      const label = typeof entry?.title === "string" ? entry.title.trim() : "";
      if (!id) return [];
      return [{ id, label: label || id }];
    });
  }
  if (!Array.isArray(config?.sections)) return [];
  return config.sections.flatMap((section) => {
    if (!Array.isArray(section?.rows)) return [];
    return section.rows.flatMap((entry) => {
      const id = typeof entry?.id === "string" ? entry.id.trim() : "";
      const label = typeof entry?.title === "string" ? entry.title.trim() : "";
      if (!id) return [];
      return [{ id, label: label || id }];
    });
  });
}

export function readInteractiveOptions(node) {
  const config = node.config ?? {};
  if (config.action === "send_buttons" || readBuilderType(node) === "buttons") {
    return readButtonOptions(config);
  }
  return readListOptions(config);
}

function isRuleGroup(entry) {
  return entry != null && typeof entry === "object" && "combinator" in entry && Array.isArray(entry.rules);
}

function extractSelectionIdFromIfElse(config, options) {
  const root = config?.ruleSet?.root;
  if (!root) return null;

  const visit = (group) => {
    for (const entry of group.rules ?? []) {
      if (isRuleGroup(entry)) {
        const nested = visit(entry);
        if (nested) return nested;
        continue;
      }
      if (
        (entry.field === "conversation.last_button_id" || entry.field === "conversation.last_list_id") &&
        entry.operator === "equals" &&
        typeof entry.value === "string" &&
        entry.value.trim()
      ) {
        return entry.value.trim();
      }
      if (entry.field === "conversation.last_button_title" && entry.operator === "equals") {
        const title = typeof entry.value === "string" ? entry.value.trim() : "";
        const matched = options.find((option) => option.label === title);
        if (matched) return matched.id;
      }
    }
    return null;
  };

  return visit(root);
}

function hasSwitchRouter(nodes, edges, interactiveNodeId) {
  return edges.some((edge) => {
    if (edge.source_node_id !== interactiveNodeId) return false;
    const target = nodes.find((node) => node.id === edge.target_node_id);
    return target && isSwitchNode(target);
  });
}

export function isLegacyParallelIfGraph(nodes, edges, interactiveNodeId) {
  if (!nodes.some((node) => node.id === interactiveNodeId && isInteractiveNode(node))) return false;
  if (hasSwitchRouter(nodes, edges, interactiveNodeId)) return false;
  const outgoing = edges.filter((edge) => edge.source_node_id === interactiveNodeId);
  if (outgoing.length <= 1) return false;
  return outgoing.every((edge) => {
    const target = nodes.find((node) => node.id === edge.target_node_id);
    return target && isIfElseNode(target);
  });
}

function findYesBranchTarget(edges, ifNodeId) {
  const yesEdge = edges.find(
    (edge) =>
      edge.source_node_id === ifNodeId &&
      (edge.condition?.branch === "yes" || edge.condition?.branchKey === "yes"),
  );
  return yesEdge?.target_node_id ?? null;
}

function createSwitchNode(interactiveNode, options) {
  return {
    id: randomUUID(),
    flow_id: interactiveNode.flow_id,
    type: "condition",
    config: {
      builderType: "switch",
      mode: "switch",
      field: SELECTION_FIELD,
      cases: options.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.id,
      })),
      includeDefault: true,
    },
    position_x: (interactiveNode.position_x ?? 0) + 280,
    position_y: interactiveNode.position_y ?? 0,
  };
}

function createEdge(flowId, sourceNodeId, targetNodeId, condition = {}) {
  return {
    id: randomUUID(),
    flow_id: flowId,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    condition,
  };
}

function migrateInteractiveNode(nodes, edges, interactiveNodeId) {
  const interactiveNode = nodes.find((node) => node.id === interactiveNodeId);
  if (!interactiveNode || !isInteractiveNode(interactiveNode)) {
    throw new Error(`Node ${interactiveNodeId} is not an interactive Buttons/List step.`);
  }

  const options = readInteractiveOptions(interactiveNode);
  if (options.length === 0) {
    throw new Error(`Interactive node ${interactiveNodeId} has no button/list options.`);
  }

  if (hasSwitchRouter(nodes, edges, interactiveNodeId)) {
    return { nodes, edges, switchNodeId: null, migrated: false };
  }

  const switchNode = createSwitchNode(interactiveNode, options);
  const caseTargets = new Map(options.map((option) => [option.id, null]));

  if (isLegacyParallelIfGraph(nodes, edges, interactiveNodeId)) {
    const outgoing = edges.filter((edge) => edge.source_node_id === interactiveNodeId);
    for (const edge of outgoing) {
      const ifNode = nodes.find((node) => node.id === edge.target_node_id);
      if (!ifNode || !isIfElseNode(ifNode)) continue;
      const selectionId = extractSelectionIdFromIfElse(ifNode.config, options);
      if (!selectionId) continue;
      caseTargets.set(selectionId, findYesBranchTarget(edges, ifNode.id));
    }
  }

  const nextNodes = [...nodes, switchNode];
  const nextEdges = edges.filter((edge) => edge.source_node_id !== interactiveNodeId);
  nextEdges.push(createEdge(interactiveNode.flow_id, interactiveNode.id, switchNode.id));

  for (const option of options) {
    const targetId = caseTargets.get(option.id);
    if (!targetId) continue;
    nextEdges.push(
      createEdge(interactiveNode.flow_id, switchNode.id, targetId, {
        case: option.id,
        label: option.label,
      }),
    );
  }

  return { nodes: nextNodes, edges: nextEdges, switchNodeId: switchNode.id, migrated: true };
}

export function migrateLegacyInteractiveRouting(nodes, edges) {
  const migratedNodeIds = [];
  let nextNodes = [...nodes];
  let nextEdges = [...edges];

  for (const node of nodes) {
    if (!isInteractiveNode(node)) continue;
    if (!isLegacyParallelIfGraph(nextNodes, nextEdges, node.id)) continue;
    const result = migrateInteractiveNode(nextNodes, nextEdges, node.id);
    nextNodes = result.nodes;
    nextEdges = result.edges;
    if (result.migrated) migratedNodeIds.push(node.id);
  }

  return { nodes: nextNodes, edges: nextEdges, migratedNodeIds };
}

/** Keep only columns that exist on automation_nodes (no updated_at). */
export function sanitizeNodeForInsert(node) {
  return {
    id: node.id,
    flow_id: node.flow_id,
    type: node.type,
    config: node.config ?? {},
    position_x: node.position_x ?? 0,
    position_y: node.position_y ?? 0,
    created_at: typeof node.created_at === "string" ? node.created_at : new Date().toISOString(),
  };
}

/** Version-graph edge ids are builder strings like "source->target"; draft table requires uuid. */
function normalizeEdgeId(id) {
  if (typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  return randomUUID();
}

/** Keep only columns that exist on automation_edges (no updated_at). */
export function sanitizeEdgeForInsert(edge) {
  return {
    id: normalizeEdgeId(edge.id),
    flow_id: edge.flow_id,
    source_node_id: edge.source_node_id,
    target_node_id: edge.target_node_id,
    condition: edge.condition ?? {},
    created_at: typeof edge.created_at === "string" ? edge.created_at : new Date().toISOString(),
  };
}

/**
 * When a failed migration wiped the draft graph, restore from the active published version.
 */
export async function loadDraftGraphOrRestoreFromVersion(sb, flow) {
  const flowId = flow.id;
  const { data: nodes, error: nodesError } = await sb.from("automation_nodes").select("*").eq("flow_id", flowId);
  const { data: edges, error: edgesError } = await sb.from("automation_edges").select("*").eq("flow_id", flowId);
  if (nodesError) throw new Error(`Failed to load draft nodes: ${nodesError.message}`);
  if (edgesError) throw new Error(`Failed to load draft edges: ${edgesError.message}`);

  const draftNodeCount = nodes?.length ?? 0;
  const draftEdgeCount = edges?.length ?? 0;
  if (draftNodeCount > 0 && draftEdgeCount > 0) {
    return { nodes: nodes ?? [], edges: edges ?? [], restoredFromVersionId: null };
  }

  if (draftNodeCount > 0 || draftEdgeCount > 0) {
    console.warn(
      `Draft graph is incomplete (${draftNodeCount} nodes, ${draftEdgeCount} edges); rebuilding from published version.`,
    );
  }

  const versionId = flow.active_version_id;
  if (!versionId) {
    return { nodes: [], edges: [], restoredFromVersionId: null };
  }

  const { data: versionNodes, error: versionNodesError } = await sb
    .from("automation_flow_version_nodes")
    .select("*")
    .eq("flow_version_id", versionId);
  const { data: versionEdges, error: versionEdgesError } = await sb
    .from("automation_flow_version_edges")
    .select("*")
    .eq("flow_version_id", versionId);
  if (versionNodesError) throw new Error(`Failed to load version nodes: ${versionNodesError.message}`);
  if (versionEdgesError) throw new Error(`Failed to load version edges: ${versionEdgesError.message}`);

  return {
    nodes: (versionNodes ?? []).map(sanitizeNodeForInsert),
    edges: (versionEdges ?? []).map(sanitizeEdgeForInsert),
    restoredFromVersionId: versionId,
  };
}

export async function replaceFlowGraph(sb, flowId, nodes, edges) {
  const { error: deleteEdgesError } = await sb.from("automation_edges").delete().eq("flow_id", flowId);
  if (deleteEdgesError) throw new Error(`Failed to delete edges: ${deleteEdgesError.message}`);

  const { error: deleteNodesError } = await sb.from("automation_nodes").delete().eq("flow_id", flowId);
  if (deleteNodesError) throw new Error(`Failed to delete nodes: ${deleteNodesError.message}`);

  const nodeRows = nodes.map(sanitizeNodeForInsert);
  const edgeRows = edges.map(sanitizeEdgeForInsert);

  if (nodeRows.length > 0) {
    const { error: insertNodesError } = await sb.from("automation_nodes").insert(nodeRows);
    if (insertNodesError) throw new Error(`Failed to insert nodes: ${insertNodesError.message}`);
  }

  if (edgeRows.length > 0) {
    const { error: insertEdgesError } = await sb.from("automation_edges").insert(edgeRows);
    if (insertEdgesError) throw new Error(`Failed to insert edges: ${insertEdgesError.message}`);
  }
}
