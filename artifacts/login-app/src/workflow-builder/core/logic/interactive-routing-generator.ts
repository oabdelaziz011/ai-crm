import { INTERACTION_RUNTIME_FIELDS } from "../variables/interaction-variables";
import { createBuilderNode } from "../persistence/workflow-mapper";
import { createEdgeFromNodes } from "../state/builder-reducer";
import {
  extractSelectionIdFromIfElseConfig,
  isLegacyParallelIfInteractiveGraph,
  type InteractiveOption,
} from "../validation/interactive-routing-validation";
import type { BuilderEdge, BuilderNode, WorkflowDocument } from "../types";
import { readListDataSourceMode } from "../conversation/list-node-config";

export type { InteractiveOption };

export type GenerateInteractiveRoutingResult = {
  document: WorkflowDocument;
  switchNodeId: string;
  created: boolean;
};

function readButtonOptions(config: Record<string, unknown>): InteractiveOption[] {
  if (!Array.isArray(config.buttons)) return [];
  return (config.buttons as Array<{ id?: string; label?: string }>).flatMap((entry) => {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!id) return [];
    return [{ id, label: label || id }];
  });
}

function readListOptions(config: Record<string, unknown>): InteractiveOption[] {
  const rows =
    readListDataSourceMode(config) === "lookup" && Array.isArray(config._lookupPreviewRows)
      ? config._lookupPreviewRows
      : Array.isArray(config.rows)
        ? config.rows
        : [];
  return rows.flatMap((entry) => {
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const label = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!id) return [];
    return [{ id, label: label || id }];
  });
}

function readInteractiveOptions(node: BuilderNode): InteractiveOption[] {
  return node.type === "buttons" ? readButtonOptions(node.config) : readListOptions(node.config);
}

function findYesBranchTarget(document: WorkflowDocument, ifNodeId: string): string | null {
  const yesEdge = document.edges.find((edge) => edge.source === ifNodeId && edge.branchKey === "yes");
  return yesEdge?.target ?? null;
}

function buildSwitchConfig(options: InteractiveOption[]): Record<string, unknown> {
  return {
    field: INTERACTION_RUNTIME_FIELDS.lastSelectionId,
    cases: options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.id,
    })),
    includeDefault: true,
  };
}

function replaceInteractiveOutgoingWithSwitch(
  document: WorkflowDocument,
  interactiveNode: BuilderNode,
  switchNode: BuilderNode,
  caseTargets: Map<string, string | null>,
): WorkflowDocument {
  const remainingEdges = document.edges.filter((edge) => edge.source !== interactiveNode.id);
  const edges: BuilderEdge[] = [...remainingEdges];

  const nodes = [...document.nodes, switchNode];
  edges.push(createEdgeFromNodes(interactiveNode.id, switchNode.id, nodes, edges));

  for (const option of readInteractiveOptions(interactiveNode)) {
    const targetId = caseTargets.get(option.id);
    if (!targetId) continue;
    const branchEdge = createEdgeFromNodes(switchNode.id, targetId, nodes, edges);
    edges.push({ ...branchEdge, branchKey: option.id, branchLabel: option.label });
  }

  const defaultTarget = caseTargets.get("default");
  if (defaultTarget) {
    const defaultEdge = createEdgeFromNodes(switchNode.id, defaultTarget, nodes, edges);
    edges.push({ ...defaultEdge, branchKey: "default", branchLabel: "Default" });
  }

  return {
    ...document,
    nodes,
    edges,
  };
}

/**
 * Inserts Switch(conversation.last_button_id) after a Buttons/List step and wires case branches.
 * When legacy parallel If/Else nodes exist, preserves their YES branch targets as Switch cases.
 */
export function generateInteractiveRouting(
  document: WorkflowDocument,
  interactiveNodeId: string,
): GenerateInteractiveRoutingResult {
  const interactiveNode = document.nodes.find((node) => node.id === interactiveNodeId);
  if (!interactiveNode || (interactiveNode.type !== "buttons" && interactiveNode.type !== "list")) {
    throw new Error("Generate Routing requires a Buttons or List step.");
  }

  const options = readInteractiveOptions(interactiveNode);
  if (options.length === 0) {
    throw new Error("Add at least one button or list option before generating routing.");
  }

  const existingSwitchEdge = document.edges.find((edge) => {
    if (edge.source !== interactiveNodeId) return false;
    const target = document.nodes.find((node) => node.id === edge.target);
    return target?.type === "switch";
  });
  if (existingSwitchEdge) {
    return {
      document,
      switchNodeId: existingSwitchEdge.target,
      created: false,
    };
  }

  const switchNode = createBuilderNode("switch", {
    x: interactiveNode.position.x + 280,
    y: interactiveNode.position.y,
  });
  switchNode.config = {
    ...switchNode.config,
    ...buildSwitchConfig(options),
  };

  const caseTargets = new Map<string, string | null>();
  for (const option of options) {
    caseTargets.set(option.id, null);
  }

  if (isLegacyParallelIfInteractiveGraph(document, interactiveNodeId)) {
    const options = readInteractiveOptions(interactiveNode);
    const outgoing = document.edges.filter((edge) => edge.source === interactiveNodeId);
    for (const edge of outgoing) {
      const ifNode = document.nodes.find((node) => node.id === edge.target);
      if (!ifNode || ifNode.type !== "if_else") continue;
      const selectionId = extractSelectionIdFromIfElseConfig(ifNode.config, options);
      if (!selectionId) continue;
      caseTargets.set(selectionId, findYesBranchTarget(document, ifNode.id));
    }
  }

  const nextDocument = replaceInteractiveOutgoingWithSwitch(document, interactiveNode, switchNode, caseTargets);

  return {
    document: nextDocument,
    switchNodeId: switchNode.id,
    created: true,
  };
}

/**
 * Migrates legacy parallel If/Else branches from Buttons/List into a Switch router.
 */
export function migrateLegacyInteractiveRouting(document: WorkflowDocument): {
  document: WorkflowDocument;
  migratedNodeIds: string[];
} {
  const migratedNodeIds: string[] = [];
  let nextDocument = document;

  for (const node of document.nodes) {
    if (node.type !== "buttons" && node.type !== "list") continue;
    if (!isLegacyParallelIfInteractiveGraph(nextDocument, node.id)) continue;
    const result = generateInteractiveRouting(nextDocument, node.id);
    nextDocument = result.document;
    migratedNodeIds.push(node.id);
  }

  return { document: nextDocument, migratedNodeIds };
}
