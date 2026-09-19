import {
  variableBinding,
  validateFieldBinding,
  normalizeRescheduleBookingConfig,
} from "@workspace/automation-platform";
import type { ValidationIssue } from "../types";

export const RESCHEDULE_BOOKING_BINDING_FIELDS = [
  { key: "bookingId", labelKey: "bookingId" },
  { key: "date", labelKey: "date" },
  { key: "slotStart", labelKey: "slotStart" },
] as const;

export function createDefaultRescheduleBookingConfig(): Record<string, unknown> {
  return {
    bookingId: variableBinding("booking.id"),
    date: variableBinding("selected_date"),
    slotStart: variableBinding("selected_slot.start_at"),
  };
}

export function normalizeRescheduleBookingNodeConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const migrated = normalizeRescheduleBookingConfig(config);
  const defaults = createDefaultRescheduleBookingConfig();
  return {
    ...defaults,
    ...migrated,
  };
}

export function validateRescheduleBookingConfig(
  config: Record<string, unknown>,
  nodeId: string,
): ValidationIssue[] {
  const normalized = normalizeRescheduleBookingNodeConfig(config);
  const issues: ValidationIssue[] = [];

  for (const field of RESCHEDULE_BOOKING_BINDING_FIELDS) {
    const binding = normalized[field.key];
    const messages = validateFieldBinding(binding, field.labelKey);
    for (const message of messages) {
      issues.push({
        id: `${nodeId}-${field.key}-binding`,
        nodeId,
        message,
        severity: "error",
        fieldLabelKey: `workflowBuilder.validation.fieldLabels.rescheduleBooking.${field.labelKey}`,
      });
    }
  }

  return issues;
}
