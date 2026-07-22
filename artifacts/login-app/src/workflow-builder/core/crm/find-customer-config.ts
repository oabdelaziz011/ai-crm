import {
  normalizeFindCustomerConfig,
  staticBinding,
  validateFieldBinding,
  variableBinding,
  type CustomerLookupField,
} from "@workspace/automation-platform";
import type { ValidationIssue } from "../types";

export const FIND_CUSTOMER_LOOKUP_OPTIONS: Array<{ value: CustomerLookupField; labelKey: string }> = [
  { value: "phone", labelKey: "phone" },
  { value: "email", labelKey: "email" },
  { value: "customer_id", labelKey: "customerId" },
];

export function createDefaultFindCustomerNodeConfig(): Record<string, unknown> {
  return {
    lookupBy: "phone",
    value: variableBinding("phone"),
  };
}

export function normalizeFindCustomerNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const migrated = normalizeFindCustomerConfig(config);
  const defaults = createDefaultFindCustomerNodeConfig();
  return {
    ...defaults,
    ...migrated,
  };
}

export function validateFindCustomerConfig(config: Record<string, unknown>, nodeId: string): ValidationIssue[] {
  const normalized = normalizeFindCustomerNodeConfig(config);
  const issues: ValidationIssue[] = [];

  for (const message of validateFieldBinding(normalized.value, "value")) {
    issues.push({
      id: `${nodeId}-value-binding`,
      nodeId,
      message,
      severity: "error",
      fieldLabelKey: "workflowBuilder.validation.fieldLabels.findCustomer.value",
    });
  }

  return issues;
}

export { staticBinding, variableBinding };
