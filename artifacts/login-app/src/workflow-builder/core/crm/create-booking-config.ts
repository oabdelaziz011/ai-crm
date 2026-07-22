import {
  normalizeCreateBookingConfig,
  staticBinding,
  variableBinding,
  validateFieldBinding,
  validateOptionalFieldBinding,
} from "@workspace/automation-platform";
import type { ValidationIssue } from "../types";

export const CREATE_BOOKING_BINDING_FIELDS = [
  { key: "service", labelKey: "service", optional: false, inputType: "text" as const },
  { key: "doctor", labelKey: "doctor", optional: false, inputType: "text" as const },
  { key: "location", labelKey: "location", optional: false, inputType: "text" as const },
  { key: "appointmentDate", labelKey: "appointmentDate", optional: false, inputType: "date" as const },
  { key: "appointmentTime", labelKey: "appointmentTime", optional: false, inputType: "time" as const },
  { key: "duration", labelKey: "duration", optional: true, inputType: "number" as const },
  { key: "customer", labelKey: "customer", optional: false, inputType: "text" as const },
  { key: "notes", labelKey: "notes", optional: true, inputType: "textarea" as const },
] as const;

export function createDefaultCreateBookingConfig(): Record<string, unknown> {
  return {
    service: staticBinding("Consultation"),
    doctor: variableBinding(""),
    location: staticBinding(""),
    appointmentDate: variableBinding("booking_date"),
    appointmentTime: variableBinding(""),
    duration: staticBinding(""),
    customer: variableBinding("customer.id"),
    notes: staticBinding(""),
  };
}

export function normalizeCreateBookingNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const migrated = normalizeCreateBookingConfig(config);
  const defaults = createDefaultCreateBookingConfig();
  return {
    ...defaults,
    ...migrated,
  };
}

export function validateCreateBookingConfig(config: Record<string, unknown>, nodeId: string): ValidationIssue[] {
  const normalized = normalizeCreateBookingNodeConfig(config);
  const issues: ValidationIssue[] = [];

  for (const field of CREATE_BOOKING_BINDING_FIELDS) {
    const binding = normalized[field.key];
    const labelKey = `workflowBuilder.validation.fieldLabels.createBooking.${field.labelKey}`;
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
