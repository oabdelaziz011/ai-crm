import type { AppointmentDomainEvent } from "../events/appointment-event-factory.js";

export interface AppointmentEventPublisherPort {
  publish(event: AppointmentDomainEvent): Promise<void>;
}

export interface AppointmentAuditPort {
  write(input: {
    companyId: string;
    appointmentId: string;
    action: string;
    actorUserId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface AppointmentIdentityPort {
  resolveCustomerId(input: {
    companyId: string;
    customerId?: string;
    leadId?: string;
    conversationId?: string;
  }): Promise<string>;
}
