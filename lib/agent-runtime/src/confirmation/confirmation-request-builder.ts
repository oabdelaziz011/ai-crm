import type { AgentTaskNode } from "../types.js";
import { resolveRiskLevel, resolveToolConfirmationPolicy } from "./confirmation-policy.js";
import type { AgentConfirmationRequest, AffectedResource, ConfirmationTokenRecord } from "./confirmation-types.js";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function extractAffectedResources(task: AgentTaskNode): AffectedResource[] {
  const input = task.toolInput ?? {};
  const resources: AffectedResource[] = [];

  const primaryId = asString(input.primaryCustomerId) ?? asString(input.customerId);
  if (primaryId) {
    resources.push({ type: "customer", id: primaryId, label: `Customer ${primaryId}` });
  }

  const duplicateIds = input.duplicateCustomerIds;
  if (Array.isArray(duplicateIds)) {
    for (const id of duplicateIds) {
      const customerId = asString(id);
      if (customerId) {
        resources.push({ type: "customer", id: customerId, label: `Duplicate ${customerId}` });
      }
    }
  }

  const rows = input.rows ?? input.customers ?? input.records;
  if (Array.isArray(rows)) {
    resources.push({
      type: "bulk_records",
      label: `${rows.length} record(s)`,
    });
  }

  const serviceId = asString(input.serviceId);
  if (serviceId) {
    resources.push({ type: "service", id: serviceId, label: `Service ${serviceId}` });
  }

  const resourceId = asString(input.resourceId);
  if (resourceId) {
    resources.push({ type: "resource", id: resourceId, label: `Resource ${resourceId}` });
  }

  if (resources.length === 0) {
    resources.push({ type: "action", label: task.title });
  }

  return resources;
}

export function buildConfirmationRequest(input: {
  workflowId: string;
  task: AgentTaskNode;
  tokenRecord: ConfirmationTokenRecord;
}): AgentConfirmationRequest {
  const declaration = resolveToolConfirmationPolicy(input.task.tool ?? "");
  const affectedResources = extractAffectedResources(input.task);
  const action = declaration.actionLabel ?? input.task.title;
  const resourceSummary = affectedResources.map((resource) => resource.label).join(", ");

  return {
    tool: input.task.tool ?? "unknown",
    action,
    summary: `${action}: ${resourceSummary || input.task.description}`.trim(),
    affectedResources,
    riskLevel: resolveRiskLevel(declaration),
    irreversible: Boolean(declaration.irreversible),
    confirmationToken: input.tokenRecord.token,
    taskId: input.task.id,
    workflowId: input.workflowId,
    expiresAt: input.tokenRecord.expiresAt,
  };
}
