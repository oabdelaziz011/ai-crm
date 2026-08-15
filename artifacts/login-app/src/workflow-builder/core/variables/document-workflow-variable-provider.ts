import { findUpstreamNodeIds } from "../graph/upstream-interactive-nodes";
import type { BuilderNode, WorkflowDocument } from "../types";
import type { WorkflowVariable } from "./variable-provider-registry";
import {
  getLookupEntityDefinition,
  isLookupEntityId,
  readListLookupEntityDefinition,
  resolveLookupOutputVariableName,
} from "@/lib/lookups";
import { readListDataSourceMode } from "../conversation/list-node-config";

const SAVE_AS_NODE_TYPES = new Set([
  "ask_question",
  "wait_for_reply",
  "list",
  "date_picker",
  "buttons",
]);

const AI_NODE_TYPES = new Set([
  "ai_decision",
  "ai_extract",
  "ai_summarizer",
  "ai_knowledge_search",
]);

const AI_DEFAULT_OUTPUT: Record<string, string> = {
  ai_decision: "decision_result",
  ai_extract: "extract_result",
  ai_summarizer: "summary_result",
  ai_knowledge_search: "knowledge_result",
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSaveAsKey(config: Record<string, unknown>): string | null {
  return readString(config.saveAs) || readString(config.inputKey) || readString(config.outputVariable);
}

function readNodeQuestionHint(node: BuilderNode): string | null {
  const config = node.config;
  const questions = config.questions;
  if (questions && typeof questions === "object" && !Array.isArray(questions)) {
    const map = questions as Record<string, unknown>;
    const ar = readString(map.ar);
    const en = readString(map.en);
    if (ar || en) return (ar || en)!.slice(0, 48);
  }
  return readString(config.question) || readString(config.message) || readString(config.label);
}

function readAIOutputVariable(node: BuilderNode): string | null {
  const aiConfig = node.config.aiConfig;
  if (aiConfig && typeof aiConfig === "object" && !Array.isArray(aiConfig)) {
    const fromAi = readString((aiConfig as { outputVariable?: unknown }).outputVariable);
    if (fromAi) return fromAi;
  }
  return readString(node.config.outputVariable) || AI_DEFAULT_OUTPUT[node.type] || null;
}

function pushUnique(target: WorkflowVariable[], seen: Set<string>, variable: WorkflowVariable) {
  if (seen.has(variable.token)) return;
  seen.add(variable.token);
  target.push(variable);
}

function buildLookupListWorkflowVariables(config: Record<string, unknown>): WorkflowVariable[] {
  if (readListDataSourceMode(config) !== "lookup") return [];

  const definition = readListLookupEntityDefinition(config);
  const variableName = resolveLookupOutputVariableName(config);
  if (!definition || !variableName) return [];

  return definition.outputFields.map((field) => ({
    id: `workflow.${variableName}.${field.id}`,
    category: "workflow" as const,
    label: `${variableName}.${field.id}`,
    labelKey: field.labelKey,
    token: `{{${variableName}.${field.id}}}`,
    previewValue: field.type,
    subgroup: variableName,
    subgroupLabelKey: definition.displayNameKey,
  }));
}

function buildSavedVariable(node: BuilderNode, key: string): WorkflowVariable {
  const hint = readNodeQuestionHint(node);
  return {
    id: `workflow.${key}.${node.id}`,
    category: "workflow",
    label: hint ? `${key} · ${hint}` : key,
    token: `{{${key}}}`,
    previewValue: key,
    subgroup: "saved_variables",
  };
}

function buildAIVariables(node: BuilderNode): WorkflowVariable[] {
  const output = readAIOutputVariable(node);
  if (!output) return [];

  const variables: WorkflowVariable[] = [
    {
      id: `workflow.ai.${node.id}.${output}`,
      category: "workflow",
      label: output,
      token: `{{${output}}}`,
      previewValue: output,
      subgroup: "ai_outputs",
    },
  ];

  if (node.type === "ai_decision") {
    variables.push(
      {
        id: `workflow.ai.${node.id}.${output}.value.label`,
        category: "workflow",
        label: `${output}.value.label`,
        token: `{{${output}.value.label}}`,
        previewValue: "label",
        subgroup: "ai_outputs",
      },
      {
        id: `workflow.ai.${node.id}.${output}.value.confidence`,
        category: "workflow",
        label: `${output}.value.confidence`,
        token: `{{${output}.value.confidence}}`,
        previewValue: "number",
        subgroup: "ai_outputs",
      },
    );
  }

  return variables;
}

function buildTicketLookupVariables(node: BuilderNode): WorkflowVariable[] {
  if (node.type !== "find_ticket" && node.type !== "create_ticket" && node.type !== "assign_ticket") {
    return [];
  }
  const prefix = node.type;
  return [
    {
      id: `workflow.${prefix}.${node.id}.ticket`,
      category: "workflow",
      label: "ticket",
      token: "{{ticket}}",
      previewValue: "object",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.ticket.id`,
      category: "workflow",
      label: "ticket.id",
      token: "{{ticket.id}}",
      previewValue: "string",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.ticket.ticketNumber`,
      category: "workflow",
      label: "ticket.ticketNumber",
      token: "{{ticket.ticketNumber}}",
      previewValue: "TKT-000123",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.ticket_number`,
      category: "workflow",
      label: "ticket_number",
      token: "{{ticket_number}}",
      previewValue: "TKT-000123",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.ticket.subject`,
      category: "workflow",
      label: "ticket.subject",
      token: "{{ticket.subject}}",
      previewValue: "string",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.ticket.status`,
      category: "workflow",
      label: "ticket.status",
      token: "{{ticket.status}}",
      previewValue: "string",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.ticket.priority`,
      category: "workflow",
      label: "ticket.priority",
      token: "{{ticket.priority}}",
      previewValue: "string",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.ticket.customerId`,
      category: "workflow",
      label: "ticket.customerId",
      token: "{{ticket.customerId}}",
      previewValue: "string",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.ticket_found`,
      category: "workflow",
      label: "ticket_found",
      token: "{{ticket_found}}",
      previewValue: "boolean",
      subgroup: "ticket",
    },
    {
      id: `workflow.${prefix}.${node.id}.lookup.status`,
      category: "workflow",
      label: "lookup.status",
      token: "{{lookup.status}}",
      previewValue: "found | not_found",
      subgroup: "ticket",
    },
  ];
}

function buildCustomerLookupVariables(node: BuilderNode): WorkflowVariable[] {
  if (node.type !== "find_customer" && node.type !== "create_customer") return [];
  return [
    {
      id: `workflow.customer.${node.id}.exists`,
      category: "workflow",
      label: "customer.exists",
      token: "{{customer.exists}}",
      previewValue: "boolean",
      subgroup: "customer_lookup",
    },
    {
      id: `workflow.customer.${node.id}.id`,
      category: "workflow",
      label: "customer.id",
      token: "{{customer.id}}",
      previewValue: "string",
      subgroup: "customer_lookup",
    },
    {
      id: `workflow.customer.${node.id}.name`,
      category: "workflow",
      label: "customer.name",
      token: "{{customer.name}}",
      previewValue: "string",
      subgroup: "customer_lookup",
    },
    {
      id: `workflow.lookup.${node.id}.status`,
      category: "workflow",
      label: "lookup.status",
      token: "{{lookup.status}}",
      previewValue: "found | not_found",
      subgroup: "customer_lookup",
    },
  ];
}

function collectVariablesFromNode(node: BuilderNode): WorkflowVariable[] {
  if (node.type === "list" && readListDataSourceMode(node.config) === "lookup") {
    return buildLookupListWorkflowVariables(node.config);
  }

  if (SAVE_AS_NODE_TYPES.has(node.type)) {
    const key = readSaveAsKey(node.config);
    return key ? [buildSavedVariable(node, key)] : [];
  }

  if (AI_NODE_TYPES.has(node.type)) {
    return buildAIVariables(node);
  }

  if (node.type === "find_ticket" || node.type === "create_ticket" || node.type === "assign_ticket") {
    return buildTicketLookupVariables(node);
  }

  if (node.type === "find_customer" || node.type === "create_customer") {
    return buildCustomerLookupVariables(node);
  }

  return [];
}

function listNodesForVariableDiscovery(document: WorkflowDocument, nodeId: string): BuilderNode[] {
  const upstreamIds = new Set(findUpstreamNodeIds(document, nodeId));
  const upstream: BuilderNode[] = [];
  const rest: BuilderNode[] = [];

  for (const node of document.nodes) {
    if (node.id === nodeId) continue;
    if (upstreamIds.has(node.id)) upstream.push(node);
    else rest.push(node);
  }

  // Prefer upstream path variables first, then the rest of the document.
  return [...upstream, ...rest];
}

export function collectDocumentWorkflowVariableKeys(document: WorkflowDocument, nodeId: string): string[] {
  const keys = new Set<string>();

  for (const node of listNodesForVariableDiscovery(document, nodeId)) {
    for (const variable of collectVariablesFromNode(node)) {
      keys.add(variable.token.replace(/^\{\{|\}\}$/g, "").trim());
    }
  }

  return [...keys];
}

export function listDocumentWorkflowVariables(document: WorkflowDocument, nodeId: string): WorkflowVariable[] {
  const variables: WorkflowVariable[] = [];
  const seen = new Set<string>();

  for (const node of listNodesForVariableDiscovery(document, nodeId)) {
    for (const variable of collectVariablesFromNode(node)) {
      pushUnique(variables, seen, variable);
    }
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
