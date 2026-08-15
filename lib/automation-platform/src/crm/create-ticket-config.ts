import { isFieldBinding, staticBinding, variableBinding } from "../field-binding/normalize.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Migrate legacy create_ticket flat fields (`subject` + `subjectField`, etc.)
 * into structured FieldBinding values used by the builder + runtime.
 */
export function normalizeCreateTicketConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...config };

  if (isFieldBinding(config.subject) || isFieldBinding(config.description) || isFieldBinding(config.priority)) {
    if (!isFieldBinding(next.customer)) {
      next.customer = variableBinding("customer.id");
    }
    return next;
  }

  const staticSubject = readString(config.subject);
  const subjectField = readString(config.subjectField);
  if (staticSubject) next.subject = staticBinding(staticSubject);
  else if (subjectField) next.subject = variableBinding(subjectField);
  else next.subject = variableBinding("");

  const staticDescription = readString(config.description);
  const descriptionField = readString(config.descriptionField);
  if (staticDescription) next.description = staticBinding(staticDescription);
  else if (descriptionField) next.description = variableBinding(descriptionField);
  else next.description = variableBinding("");

  const priorityField = readString(config.priorityField);
  const staticPriority = readString(config.priority);
  if (priorityField) next.priority = variableBinding(priorityField);
  else if (staticPriority) next.priority = staticBinding(staticPriority);
  else next.priority = staticBinding("normal");

  if (!isFieldBinding(next.customer)) {
    const customerField = readString(config.customerField) ?? readString(config.customerIdField);
    if (customerField) next.customer = variableBinding(customerField);
    else if (readString(config.customerId)) next.customer = staticBinding(readString(config.customerId)!);
    else next.customer = variableBinding("customer.id");
  }

  return next;
}
