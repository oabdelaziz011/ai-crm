import type { AppointmentAuditPort, AppointmentEventPublisherPort, AppointmentIdentityPort } from "./appointment-platform-ports.js";

export function createNoopAppointmentEventPublisher(): AppointmentEventPublisherPort {
  return { publish: async () => {} };
}

export function createNoopAppointmentAuditPort(): AppointmentAuditPort {
  return { write: async () => {} };
}

export function createNoopAppointmentIdentityPort(): AppointmentIdentityPort {
  return {
    resolveCustomerId: async (input) => {
      if (!input.customerId) throw new Error("customerId is required.");
      return input.customerId;
    },
  };
}
