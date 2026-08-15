import {

  normalizeCreateTicketConfig,

  staticBinding,

  variableBinding,

  validateFieldBinding,

  validateOptionalFieldBinding,

} from "@workspace/automation-platform";

import type { ValidationIssue } from "../types";



export const CREATE_TICKET_BINDING_FIELDS = [

  { key: "customer", labelKey: "customer", optional: true, inputType: "text" as const },

  { key: "subject", labelKey: "subject", optional: false, inputType: "text" as const },

  { key: "description", labelKey: "description", optional: true, inputType: "textarea" as const },

  { key: "priority", labelKey: "priority", optional: true, inputType: "text" as const },

] as const;



export function createDefaultCreateTicketConfig(): Record<string, unknown> {

  return {

    customer: variableBinding("customer.id"),

    subject: variableBinding(""),

    description: variableBinding(""),

    priority: staticBinding("normal"),

  };

}



export function normalizeCreateTicketNodeConfig(config: Record<string, unknown>): Record<string, unknown> {

  const migrated = normalizeCreateTicketConfig(config);

  const defaults = createDefaultCreateTicketConfig();

  return {

    ...defaults,

    ...migrated,

    customer: migrated.customer ?? defaults.customer,

  };

}



export function validateCreateTicketConfig(config: Record<string, unknown>, nodeId: string): ValidationIssue[] {

  const normalized = normalizeCreateTicketNodeConfig(config);

  const issues: ValidationIssue[] = [];



  for (const field of CREATE_TICKET_BINDING_FIELDS) {

    const binding = normalized[field.key];

    const labelKey = `workflowBuilder.validation.fieldLabels.createTicket.${field.labelKey}`;

    const messages = field.optional

      ? validateOptionalFieldBinding(binding, field.labelKey)

      : validateFieldBinding(binding, field.labelKey);



    for (const message of messages) {

      issues.push({

        id: `${nodeId}-${field.key}-binding`,

        nodeId,

        message,

        severity: "error",

        fieldLabelKey: labelKey,

      });

    }

  }



  return issues;

}


