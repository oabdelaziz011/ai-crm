import {
  normalizeFindTicketConfig,
  validateFieldBinding,
  variableBinding,
} from "@workspace/automation-platform";
import type { ValidationIssue } from "../types";

export function createDefaultFindTicketConfig(): Record<string, unknown> {
  return {
    ticketNumber: variableBinding(""),
  };
}

export function normalizeFindTicketNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const migrated = normalizeFindTicketConfig(config);
  const defaults = createDefaultFindTicketConfig();
  return {
    ...defaults,
    ...migrated,
  };
}

export function validateFindTicketConfig(config: Record<string, unknown>, nodeId: string): ValidationIssue[] {
  const normalized = normalizeFindTicketNodeConfig(config);
  const issues: ValidationIssue[] = [];

  for (const message of validateFieldBinding(normalized.ticketNumber, "ticket number")) {
    issues.push({
      id: `${nodeId}-ticketNumber-binding`,
      nodeId,
      message,
      severity: "error",
      fieldLabelKey: "workflowBuilder.validation.fieldLabels.findTicket.ticketNumber",
    });
  }

  return issues;
}
