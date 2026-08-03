import { BookingDomainError } from "@workspace/scheduling-engine";
import { APPOINTMENT_PERMISSIONS, UPCOMING_APPOINTMENT_STATUSES } from "../constants.js";
import {
  createAppointmentCancelledEvent,
  createAppointmentCheckedInEvent,
  createAppointmentCompletedEvent,
  createAppointmentConfirmedEvent,
  createAppointmentCreatedEvent,
  createAppointmentNoShowEvent,
  createAppointmentRescheduledEvent,
  createAppointmentResourceAssignedEvent,
  createAppointmentUpdatedEvent,
} from "../events/appointment-event-factory.js";
import { AppointmentNotFoundError, AppointmentValidationError } from "../errors.js";
import type {
  AppointmentAuditPort,
  AppointmentEventPublisherPort,
  AppointmentIdentityPort,
} from "../ports/appointment-platform-ports.js";
import type { SchedulingEnginePort } from "../ports/scheduling-engine-port.js";
import type { AppointmentRepository } from "../repositories/appointment-repository-port.js";
import type { AppointmentRecord, AppointmentServiceContext } from "../types/appointment-types.js";
import {
  assertAppointmentCompanyAccess,
  readOptionalString,
  readRequiredString,
  requireAppointmentPermission,
} from "../validators/appointment-guards.js";

export type AppointmentCommandServiceDeps = {
  appointments: AppointmentRepository;
  engine: SchedulingEnginePort;
  identity: AppointmentIdentityPort;
  events: AppointmentEventPublisherPort;
  audit: AppointmentAuditPort;
};

export class AppointmentCommandService {
  constructor(private readonly deps: AppointmentCommandServiceDeps) {}

  async createAppointment(
    ctx: AppointmentServiceContext,
    input: {
      companyId: string;
      customerId?: string;
      leadId?: string;
      conversationId?: string;
      resourceId: string;
      serviceId: string;
      date: string;
      slotStart: string;
      source?: AppointmentRecord["source"];
      notes?: string;
      branchId?: string;
    },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "create");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    const customerId = await this.deps.identity.resolveCustomerId({
      companyId: input.companyId,
      customerId: input.customerId,
      leadId: input.leadId,
      conversationId: input.conversationId,
    });

    try {
      const result = await this.deps.engine.createBooking({
        companyId: input.companyId,
        customerId,
        resourceId: readRequiredString(input.resourceId, "resourceId"),
        serviceId: readRequiredString(input.serviceId, "serviceId"),
        date: readRequiredString(input.date, "date"),
        slotStart: readRequiredString(input.slotStart, "slotStart"),
        source: input.source ?? "crm",
        notes: input.notes ?? null,
        createdBy: actorUserId,
        branchId: input.branchId ?? null,
      });

      let appointment = this.deps.appointments.mapRow(result.booking);

      if (input.leadId || input.conversationId) {
        appointment = await this.deps.appointments.linkIdentity({
          companyId: input.companyId,
          appointmentId: appointment.id,
          leadId: input.leadId ?? null,
          conversationId: input.conversationId ?? null,
          updatedBy: actorUserId,
        });
      }

      await this.deps.events.publish(createAppointmentCreatedEvent(appointment, actorUserId));
      await this.deps.audit.write({
        companyId: input.companyId,
        appointmentId: appointment.id,
        action: "appointment_created",
        actorUserId,
      });

      return { appointment };
    } catch (error) {
      if (error instanceof BookingDomainError) {
        throw new AppointmentValidationError(error.codes.join(", "));
      }
      throw error;
    }
  }

  async updateAppointment(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string; notes?: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    const existing = await this.requireAppointment(input.companyId, input.appointmentId);
    const appointment = await this.deps.appointments.updateFields({
      companyId: input.companyId,
      appointmentId: input.appointmentId,
      notes: input.notes,
      updatedBy: actorUserId,
    });

    await this.deps.events.publish(
      createAppointmentUpdatedEvent(appointment, actorUserId, { notes: input.notes }),
    );
    await this.deps.audit.write({
      companyId: input.companyId,
      appointmentId: appointment.id,
      action: "appointment_updated",
      actorUserId,
      metadata: { previousNotes: existing.notes },
    });

    return { appointment };
  }

  async cancelAppointment(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string; reason?: string; notes?: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    try {
      const result = await this.deps.engine.cancelBooking({
        companyId: input.companyId,
        bookingId: input.appointmentId,
        updatedBy: actorUserId,
        reason: input.reason,
        notes: input.notes,
      });

      const appointment = this.deps.appointments.mapRow(result.booking);
      await this.deps.events.publish(
        createAppointmentCancelledEvent(appointment, actorUserId, input.reason ?? input.notes),
      );
      await this.deps.audit.write({
        companyId: input.companyId,
        appointmentId: appointment.id,
        action: "appointment_cancelled",
        actorUserId,
      });

      return { appointment };
    } catch (error) {
      if (error instanceof BookingDomainError) {
        throw new AppointmentValidationError(error.codes.join(", "));
      }
      throw error;
    }
  }

  async rescheduleAppointment(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string; date: string; slotStart: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    const existing = await this.requireAppointment(input.companyId, input.appointmentId);
    const previousStartAt = existing.startAt;

    try {
      const result = await this.deps.engine.rescheduleBooking({
        companyId: input.companyId,
        bookingId: input.appointmentId,
        date: readRequiredString(input.date, "date"),
        slotStart: readRequiredString(input.slotStart, "slotStart"),
        updatedBy: actorUserId,
      });

      const appointment = this.deps.appointments.mapRow(result.booking);
      await this.deps.events.publish(
        createAppointmentRescheduledEvent(appointment, actorUserId, previousStartAt),
      );
      await this.deps.audit.write({
        companyId: input.companyId,
        appointmentId: appointment.id,
        action: "appointment_rescheduled",
        actorUserId,
        metadata: { previousStartAt },
      });

      return { appointment };
    } catch (error) {
      if (error instanceof BookingDomainError) {
        throw new AppointmentValidationError(error.codes.join(", "));
      }
      throw error;
    }
  }

  async confirmAppointment(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    const appointment = await this.deps.appointments.confirmAppointment(
      input.companyId,
      input.appointmentId,
      actorUserId,
    );

    await this.deps.events.publish(createAppointmentConfirmedEvent(appointment, actorUserId));
    await this.deps.audit.write({
      companyId: input.companyId,
      appointmentId: appointment.id,
      action: "appointment_confirmed",
      actorUserId,
    });

    return { appointment };
  }

  async checkInAppointment(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    try {
      const result = await this.deps.engine.checkInBooking({
        companyId: input.companyId,
        bookingId: input.appointmentId,
        updatedBy: actorUserId,
      });

      const appointment = this.deps.appointments.mapRow(result.booking);
      await this.deps.events.publish(createAppointmentCheckedInEvent(appointment, actorUserId));
      await this.deps.audit.write({
        companyId: input.companyId,
        appointmentId: appointment.id,
        action: "appointment_checked_in",
        actorUserId,
      });

      return { appointment };
    } catch (error) {
      if (error instanceof BookingDomainError) {
        throw new AppointmentValidationError(error.codes.join(", "));
      }
      throw error;
    }
  }

  async completeAppointment(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    try {
      const result = await this.deps.engine.completeBooking({
        companyId: input.companyId,
        bookingId: input.appointmentId,
        updatedBy: actorUserId,
      });

      const appointment = this.deps.appointments.mapRow(result.booking);
      await this.deps.events.publish(createAppointmentCompletedEvent(appointment, actorUserId));
      await this.deps.audit.write({
        companyId: input.companyId,
        appointmentId: appointment.id,
        action: "appointment_completed",
        actorUserId,
      });

      return { appointment };
    } catch (error) {
      if (error instanceof BookingDomainError) {
        throw new AppointmentValidationError(error.codes.join(", "));
      }
      throw error;
    }
  }

  async noShowAppointment(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string; gracePeriodMinutes?: number },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    try {
      const result = await this.deps.engine.markNoShowBooking({
        companyId: input.companyId,
        bookingId: input.appointmentId,
        updatedBy: actorUserId,
        gracePeriodMinutes: input.gracePeriodMinutes,
      });

      const appointment = this.deps.appointments.mapRow(result.booking);
      await this.deps.events.publish(createAppointmentNoShowEvent(appointment, actorUserId));
      await this.deps.audit.write({
        companyId: input.companyId,
        appointmentId: appointment.id,
        action: "appointment_no_show",
        actorUserId,
      });

      return { appointment };
    } catch (error) {
      if (error instanceof BookingDomainError) {
        throw new AppointmentValidationError(error.codes.join(", "));
      }
      throw error;
    }
  }

  async assignResource(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string; resourceId: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    const existing = await this.requireAppointment(input.companyId, input.appointmentId);
    if (!UPCOMING_APPOINTMENT_STATUSES.includes(existing.status as (typeof UPCOMING_APPOINTMENT_STATUSES)[number])) {
      throw new AppointmentValidationError("Resource can only be assigned to upcoming appointments.");
    }

    const resourceId = readRequiredString(input.resourceId, "resourceId");
    const appointment = await this.deps.appointments.updateFields({
      companyId: input.companyId,
      appointmentId: input.appointmentId,
      resourceId,
      updatedBy: actorUserId,
    });

    await this.deps.events.publish(createAppointmentResourceAssignedEvent(appointment, actorUserId, resourceId));
    await this.deps.audit.write({
      companyId: input.companyId,
      appointmentId: appointment.id,
      action: "appointment_resource_assigned",
      actorUserId,
      metadata: { previousResourceId: existing.resourceId, resourceId },
    });

    return { appointment };
  }

  async releaseResource(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    throw new AppointmentValidationError(
      "ReleaseResource requires rescheduling to an available resource — use assignResource or rescheduleAppointment.",
    );
  }

  async moveAppointment(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string; date: string; slotStart: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    return this.rescheduleAppointment(ctx, input);
  }

  async linkConversation(
    ctx: AppointmentServiceContext,
    input: { companyId: string; appointmentId: string; conversationId: string; leadId?: string },
  ): Promise<{ appointment: AppointmentRecord }> {
    const actorUserId = requireAppointmentPermission(ctx, "edit");
    assertAppointmentCompanyAccess(ctx, input.companyId);

    const appointment = await this.deps.appointments.linkIdentity({
      companyId: input.companyId,
      appointmentId: input.appointmentId,
      conversationId: readRequiredString(input.conversationId, "conversationId"),
      leadId: input.leadId ?? null,
      updatedBy: actorUserId,
    });

    await this.deps.events.publish(
      createAppointmentUpdatedEvent(appointment, actorUserId, {
        conversationId: input.conversationId,
        leadId: input.leadId,
      }),
    );

    return { appointment };
  }

  private async requireAppointment(companyId: string, appointmentId: string): Promise<AppointmentRecord> {
    const appointment = await this.deps.appointments.getAppointment(companyId, appointmentId);
    if (!appointment) throw new AppointmentNotFoundError();
    return appointment;
  }
}
