import type { OperationsWorkspaceConfig } from "../types/metadata-types.js";
import { normalizeOperationsWorkspaceConfig } from "./operations-config-merge.js";

export type OperationsConfigValidationIssue = {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type OperationsConfigValidationReport = {
  valid: boolean;
  issues: OperationsConfigValidationIssue[];
  checkedAt: string;
};

function issue(
  code: string,
  severity: OperationsConfigValidationIssue["severity"],
  path: string,
  message: string,
): OperationsConfigValidationIssue {
  return { code, severity, path, message };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validates a full operations.workspace configuration blob before publish. */
export function validateOperationsWorkspaceConfig(
  config: OperationsWorkspaceConfig,
): OperationsConfigValidationReport {
  const issues: OperationsConfigValidationIssue[] = [];

  if (!isNonEmptyString(config.workspaceName)) issues.push(issue("required", "error", "workspaceName", "Workspace name is required"));
  if (!isNonEmptyString(config.moduleName)) issues.push(issue("required", "error", "moduleName", "Module name is required"));
  if (!isNonEmptyString(config.rowEntityName)) issues.push(issue("required", "error", "rowEntityName", "Row entity name is required"));
  if (!isNonEmptyString(config.templateKey)) issues.push(issue("required", "error", "templateKey", "Template key is required"));

  const columnIds = new Set<string>();
  for (const col of config.columns ?? []) {
    if (columnIds.has(col.id)) issues.push(issue("duplicate", "error", `columns.${col.id}`, "Duplicate column id"));
    columnIds.add(col.id);
    if (!isNonEmptyString(col.internalName)) issues.push(issue("required", "error", `columns.${col.id}.internalName`, "Column internal name required"));
    if (!isNonEmptyString(col.displayName)) issues.push(issue("required", "error", `columns.${col.id}.displayName`, "Column display name required"));
  }

  const statusIds = new Set<string>();
  for (const status of config.statuses ?? []) {
    if (statusIds.has(status.id)) issues.push(issue("duplicate", "error", `statuses.${status.id}`, "Duplicate status id"));
    statusIds.add(status.id);
  }

  for (const transition of config.statusTransitions ?? []) {
    if (!statusIds.has(transition.fromStatusId)) {
      issues.push(issue("reference", "error", `statusTransitions.${transition.fromStatusId}`, "Unknown from status"));
    }
    if (!statusIds.has(transition.toStatusId)) {
      issues.push(issue("reference", "error", `statusTransitions.${transition.toStatusId}`, "Unknown to status"));
    }
  }

  for (const payment of config.paymentStatuses ?? []) {
    if (!isNonEmptyString(payment.internalName)) {
      issues.push(issue("required", "error", `paymentStatuses.${payment.id}`, "Payment status internal name required"));
    }
  }

  for (const service of config.services ?? []) {
    if (!isNonEmptyString(service.name)) issues.push(issue("required", "error", `services.${service.id}`, "Service name required"));
  }

  for (const resource of config.resources ?? []) {
    if (!isNonEmptyString(resource.name)) issues.push(issue("required", "error", `resources.${resource.id}`, "Resource name required"));
  }

  for (const section of config.customer360?.sections ?? []) {
    if (!isNonEmptyString(section.titleKey)) {
      issues.push(issue("required", "warning", `customer360.sections.${section.id}`, "Section titleKey missing"));
    }
  }

  for (const block of config.intelligence?.blocks ?? []) {
    if (!block.id) issues.push(issue("required", "warning", "intelligence.blocks", "Intelligence block id missing"));
  }

  for (const stage of config.intelligence?.workflowStages ?? []) {
    if (!isNonEmptyString(stage.labelKey)) {
      issues.push(issue("required", "warning", `intelligence.workflowStages.${stage.id}`, "Workflow stage labelKey missing"));
    }
  }

  for (const rule of config.intelligence?.alertRules ?? []) {
    if (rule.enabled && !isNonEmptyString(rule.titleKey)) {
      issues.push(issue("required", "warning", `intelligence.alertRules.${rule.id}`, "Alert rule titleKey missing"));
    }
  }

  if ((config.columns ?? []).length === 0) {
    issues.push(issue("empty", "error", "columns", "At least one column is required"));
  }

  if ((config.statuses ?? []).length === 0) {
    issues.push(issue("empty", "error", "statuses", "At least one status is required"));
  }

  if (!(config.statuses ?? []).some((s) => s.isTerminal)) {
    issues.push(issue("workflow", "error", "statuses", "At least one terminal status is required"));
  }

  for (const view of config.views?.savedViews ?? []) {
    for (const columnId of view.columnIds) {
      if (columnId && !columnIds.has(columnId)) {
        issues.push(issue("reference", "error", `views.savedViews.${view.id}`, `Unknown column ${columnId}`));
      }
    }
    for (const sort of view.sort ?? []) {
      if (!columnIds.has(sort.columnId)) {
        issues.push(issue("reference", "error", `views.savedViews.${view.id}.sort`, `Unknown sort column ${sort.columnId}`));
      }
    }
  }

  for (const sort of config.queueRules?.defaultSort ?? []) {
    if (!columnIds.has(sort.columnId)) {
      issues.push(issue("reference", "error", "queueRules.defaultSort", `Unknown sort column ${sort.columnId}`));
    }
  }

  for (const kanbanCol of config.kanban?.columns ?? []) {
    if (!statusIds.has(kanbanCol.statusId)) {
      issues.push(issue("reference", "error", `kanban.columns.${kanbanCol.id}`, "Unknown kanban status reference"));
    }
  }

  for (const [entityId, roles] of Object.entries(config.permissions?.columns ?? {})) {
    if (entityId && !columnIds.has(entityId)) {
      issues.push(issue("reference", "error", `permissions.columns.${entityId}`, "Unknown column permission target"));
    }
    if (!roles?.length) issues.push(issue("required", "warning", `permissions.columns.${entityId}`, "No roles assigned"));
  }

  for (const [entityId, roles] of Object.entries(config.permissions?.statuses ?? {})) {
    if (entityId && !statusIds.has(entityId)) {
      issues.push(issue("reference", "error", `permissions.statuses.${entityId}`, "Unknown status permission target"));
    }
    if (!roles?.length) issues.push(issue("required", "warning", `permissions.statuses.${entityId}`, "No roles assigned"));
  }

  for (const [actionKey, roles] of Object.entries(config.permissions?.actions ?? {})) {
    if (!isNonEmptyString(actionKey)) issues.push(issue("required", "error", "permissions.actions", "Action key required"));
    if (!roles?.length) issues.push(issue("required", "warning", `permissions.actions.${actionKey}`, "No roles assigned"));
  }

  for (const channel of ["email", "sms", "whatsapp", "push"] as const) {
    const cfg = config.notifications?.[channel];
    if (cfg?.enabled && !isNonEmptyString(cfg.templateId ?? "")) {
      issues.push(issue("reference", "warning", `notifications.${channel}`, "Enabled channel missing templateId"));
    }
  }

  for (const rule of config.routing?.rules ?? []) {
    if (rule.enabled && (!isNonEmptyString(rule.condition) || !isNonEmptyString(rule.target))) {
      issues.push(issue("required", "error", `routing.rules.${rule.id}`, "Enabled routing rule requires condition and target"));
    }
  }

  if (config.ai?.copilotEnabled && !(config.ai.allowedTools ?? []).length) {
    issues.push(issue("required", "warning", "ai.allowedTools", "Copilot enabled but no allowed tools configured"));
  }

  for (const schema of config.forms?.schemas ?? []) {
    if (!isNonEmptyString(schema.name)) issues.push(issue("required", "error", `forms.schemas.${schema.id}`, "Form name required"));
    for (const field of schema.fields ?? []) {
      if (!isNonEmptyString(field.key)) issues.push(issue("required", "error", `forms.schemas.${schema.id}.fields.${field.id}`, "Form field key required"));
    }
  }

  if ((config.customer360?.sections ?? []).length === 0) {
    issues.push(issue("empty", "error", "customer360.sections", "Customer360 requires at least one section"));
  }

  if ((config.intelligence?.blocks ?? []).length === 0) {
    issues.push(issue("empty", "error", "intelligence.blocks", "Intelligence requires at least one block"));
  }

  if ((config.intelligence?.journeySteps ?? []).length === 0) {
    issues.push(issue("empty", "error", "intelligence.journeySteps", "Intelligence requires journey steps"));
  }

  if ((config.intelligence?.workflowStages ?? []).length === 0) {
    issues.push(issue("empty", "error", "intelligence.workflowStages", "Intelligence requires workflow stages"));
  }

  if ((config.intelligence?.alertRules ?? []).length === 0) {
    issues.push(issue("empty", "error", "intelligence.alertRules", "Intelligence requires alert rules"));
  }

  if ((config.intelligence?.recommendationRules ?? []).length === 0) {
    issues.push(issue("empty", "error", "intelligence.recommendationRules", "Intelligence requires recommendation rules"));
  }

  if (!(config.businessContext?.fields ?? []).length) {
    issues.push(issue("empty", "error", "businessContext.fields", "Business context requires at least one field"));
  }

  if (config.ai?.copilotEnabled && !(config.ai.copilotCapabilities ?? []).length) {
    issues.push(issue("required", "error", "ai.copilotCapabilities", "Copilot enabled but no capabilities configured"));
  }

  if ((config.dashboard?.widgets ?? []).length === 0) {
    issues.push(issue("empty", "warning", "dashboard.widgets", "No dashboard widgets configured"));
  }

  return {
    valid: issues.every((i) => i.severity !== "error"),
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export function parseOperationsWorkspaceConfig(
  raw: Record<string, unknown>,
  templateKey = String(raw.templateKey ?? "clinic"),
  companyId = String(raw.companyId ?? ""),
): OperationsWorkspaceConfig {
  if (companyId) {
    return normalizeOperationsWorkspaceConfig(raw, templateKey, companyId);
  }
  return raw as unknown as OperationsWorkspaceConfig;
}
