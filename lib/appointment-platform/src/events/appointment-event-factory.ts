import type { APPOINTMENT_DOMAIN_EVENTS } from "../constants.js";
import type { AppointmentRecord } from "../types/appointment-types.js";

export type AppointmentDomainEventType = (typeof APPOINTMENT_DOMAIN_EVENTS)[number];

export type AppointmentDomainEvent = {
  type: AppointmentDomainEventType;
  companyId: string;
  appointmentId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export function createAppointmentCreatedEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
): AppointmentDomainEvent {
  return {
    type: "appointment_created",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId, status: record.status, customerId: record.customerId, leadId: record.leadId },
  };
}

export function createAppointmentUpdatedEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
  patch: Record<string, unknown>,
): AppointmentDomainEvent {
  return {
    type: "appointment_updated",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId, patch },
  };
}

export function createAppointmentCancelledEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
  reason?: string | null,
): AppointmentDomainEvent {
  return {
    type: "appointment_cancelled",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId, reason },
  };
}

export function createAppointmentCompletedEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
): AppointmentDomainEvent {
  return {
    type: "appointment_completed",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId },
  };
}

export function createAppointmentConfirmedEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
): AppointmentDomainEvent {
  return {
    type: "appointment_confirmed",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId },
  };
}

export function createAppointmentRescheduledEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
  previousStartAt: string,
): AppointmentDomainEvent {
  return {
    type: "appointment_rescheduled",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId, previousStartAt, startAt: record.startAt },
  };
}

export function createAppointmentNoShowEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
): AppointmentDomainEvent {
  return {
    type: "appointment_no_show",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId },
  };
}

export function createAppointmentCheckedInEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
): AppointmentDomainEvent {
  return {
    type: "appointment_checked_in",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId },
  };
}

export function createAppointmentResourceAssignedEvent(
  record: AppointmentRecord,
  actorUserId: string | null,
  resourceId: string,
): AppointmentDomainEvent {
  return {
    type: "appointment_resource_assigned",
    companyId: record.companyId,
    appointmentId: record.id,
    occurredAt: new Date().toISOString(),
    payload: { actorUserId, resourceId },
  };
}
