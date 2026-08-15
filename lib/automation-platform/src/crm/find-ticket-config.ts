import { isFieldBinding, staticBinding, variableBinding } from "../field-binding/normalize.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Migrate legacy flat ticketNumber/ticketNumberField into a FieldBinding. */
export function normalizeFindTicketConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (isFieldBinding(config.ticketNumber)) {
    return { ...config };
  }

  const next: Record<string, unknown> = { ...config };
  const staticNumber = readString(config.ticketNumber);
  const numberField = readString(config.ticketNumberField) ?? readString(config.valueField);

  if (staticNumber && !numberField) next.ticketNumber = staticBinding(staticNumber);
  else if (numberField) next.ticketNumber = variableBinding(numberField);
  else if (typeof config.ticketNumber === "string") next.ticketNumber = variableBinding(config.ticketNumber);
  else next.ticketNumber = variableBinding("");

  return next;
}
