import { isFieldBinding, staticBinding, variableBinding } from "../field-binding/normalize.js";

/** Migrate legacy create_booking flat fields into structured bindings. */
export function normalizeCreateBookingConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (isFieldBinding(config.service) || isFieldBinding(config.appointmentDate)) {
    return { ...config };
  }

  const next: Record<string, unknown> = { ...config };

  if (typeof config.serviceName === "string") {
    next.service = staticBinding(config.serviceName);
  }
  if (typeof config.dateField === "string") {
    next.appointmentDate = variableBinding(config.dateField);
    next.appointmentTime = staticBinding("00:00");
  }
  if (!next.doctor) next.doctor = staticBinding("unspecified");
  if (!next.location) next.location = staticBinding("unspecified");
  if (!next.customer) next.customer = variableBinding("customer.id");

  return next;
}
