import { findUpstreamNodeIds } from "../graph/upstream-interactive-nodes";
import type { WorkflowDocument } from "../types";
import type { WorkflowVariable } from "./variable-provider-registry";

const WORKFLOW_VARIABLE_NODE_TYPES = new Set(["ask_question", "wait_for_reply"]);

function readSaveAsKey(config: Record<string, unknown>): string | null {
  const saveAs = typeof config.saveAs === "string" ? config.saveAs.trim() : "";
  return saveAs || null;
}

export function collectDocumentWorkflowVariableKeys(document: WorkflowDocument, nodeId: string): string[] {
  const keys = new Set<string>();

  for (const upstreamId of findUpstreamNodeIds(document, nodeId)) {
    const node = document.nodes.find((entry) => entry.id === upstreamId);
    if (!node || !WORKFLOW_VARIABLE_NODE_TYPES.has(node.type)) continue;
    const key = readSaveAsKey(node.config);
    if (key) keys.add(key);
  }

  return [...keys];
}

export function listDocumentWorkflowVariables(document: WorkflowDocument, nodeId: string): WorkflowVariable[] {
  return collectDocumentWorkflowVariableKeys(document, nodeId).map((key) => ({
    id: `workflow.${key}`,
    category: "workflow" as const,
    label: key,
    token: `{{${key}}}`,
    previewValue: key,
    subgroup: "saved_variables",
  }));
}
