import { findUpstreamNodeIds } from "../graph/upstream-interactive-nodes";
import type { WorkflowDocument } from "../types";
import type { WorkflowVariable } from "./variable-provider-registry";
import {
  getLookupEntityDefinition,
  isLookupEntityId,
  readListLookupEntityDefinition,
  resolveLookupOutputVariableName,
} from "@/lib/lookups";
import { readListDataSourceMode } from "../conversation/list-node-config";

const WORKFLOW_VARIABLE_NODE_TYPES = new Set(["ask_question", "wait_for_reply", "list", "date_picker"]);

function readSaveAsKey(config: Record<string, unknown>): string | null {
  const saveAs =
    typeof config.saveAs === "string"
      ? config.saveAs.trim()
      : typeof config.inputKey === "string"
        ? config.inputKey.trim()
        : "";
  return saveAs || null;
}

function buildLookupListWorkflowVariables(config: Record<string, unknown>): WorkflowVariable[] {
  if (readListDataSourceMode(config) !== "lookup") return [];

  const definition = readListLookupEntityDefinition(config);
  const variableName = resolveLookupOutputVariableName(config);
  if (!definition || !variableName) return [];

  return definition.outputFields.map((field) => ({
    id: `workflow.${variableName}.${field.id}`,
    category: "workflow" as const,
    label: field.id,
    labelKey: field.labelKey,
    token: `{{${variableName}.${field.id}}}`,
    previewValue: field.type,
    subgroup: variableName,
    subgroupLabelKey: definition.displayNameKey,
  }));
}

export function collectDocumentWorkflowVariableKeys(document: WorkflowDocument, nodeId: string): string[] {
  const keys = new Set<string>();

  for (const upstreamId of findUpstreamNodeIds(document, nodeId)) {
    const node = document.nodes.find((entry) => entry.id === upstreamId);
    if (!node || !WORKFLOW_VARIABLE_NODE_TYPES.has(node.type)) continue;

    if (node.type === "list" && readListDataSourceMode(node.config) === "lookup") {
      const variableName = resolveLookupOutputVariableName(node.config);
      const lookup = typeof node.config.lookup === "string" ? node.config.lookup.trim() : "";
      if (variableName && isLookupEntityId(lookup)) {
        const definition = getLookupEntityDefinition(lookup);
        keys.add(variableName);
        for (const field of definition.outputFields) {
          keys.add(`${variableName}.${field.id}`);
        }
      }
      continue;
    }

    const key = readSaveAsKey(node.config);
    if (key) keys.add(key);
  }

  return [...keys];
}

export function listDocumentWorkflowVariables(document: WorkflowDocument, nodeId: string): WorkflowVariable[] {
  const variables: WorkflowVariable[] = [];

  for (const upstreamId of findUpstreamNodeIds(document, nodeId)) {
    const node = document.nodes.find((entry) => entry.id === upstreamId);
    if (!node || !WORKFLOW_VARIABLE_NODE_TYPES.has(node.type)) continue;

    if (node.type === "list" && readListDataSourceMode(node.config) === "lookup") {
      variables.push(...buildLookupListWorkflowVariables(node.config));
      continue;
    }

    const key = readSaveAsKey(node.config);
    if (!key) continue;
    variables.push({
      id: `workflow.${key}`,
      category: "workflow",
      label: key,
      token: `{{${key}}}`,
      previewValue: key,
      subgroup: "saved_variables",
    });
  }

  return variables;
}

export function findDocumentWorkflowVariableByField(
  document: WorkflowDocument,
  nodeId: string,
  field: string,
): WorkflowVariable | undefined {
  const normalized = field.replace(/^\{\{|\}\}$/g, "").trim();
  return listDocumentWorkflowVariables(document, nodeId).find(
    (variable) => variable.token.replace(/^\{\{|\}\}$/g, "").trim() === normalized,
  );
}
