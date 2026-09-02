import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import type { EntityNotesService } from "@/lib/entity-workspace";
import { BookingLifecycleService } from "@/lib/scheduling/booking-domain/booking-lifecycle-service";
import type { BookingDomainService } from "@/lib/scheduling/booking-domain/booking-domain-service";
import type { BookingPublishOutcome } from "@/lib/scheduling/booking-domain/events";
import type { SchedulingBooking } from "@/lib/scheduling/booking-domain/types";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { SchedulingBookingRulesRepository } from "@/lib/scheduling/repositories/rules-repository";
import { bookingOverlapsExceptionWindow, resolveExceptionWindow } from "./exception-window";
import { recountExceptionNotificationCounts } from "./reconcile-exception-notification";
import { BusinessAppointmentExceptionRepository } from "./repository";
import {
  BusinessApologyExceptionError,
  type BusinessApologyExceptionInput,
  type BusinessApologyExecuteResult,
  type BusinessApologyPreviewResult,
  type BusinessAppointmentExceptionItemRecord,
  type BusinessAppointmentExceptionRecord,
} from "./types";

export type BusinessExceptionNotesFactory = (
  ctx: LoginAppPortContext,
  client: SupabaseClient,
) => EntityNotesService;

function assertCanManage(ctx: LoginAppPortContext): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.hasPermission("scheduling.edit") && ctx.hasPermission("bookings.edit")) return;
  throw new BusinessApologyExceptionError("Not authorized", "unauthorized");
}

function assertCanPreview(ctx: LoginAppPortContext): void {
  if (ctx.isSuperAdmin) return;
  if (
    ctx.hasPermission("scheduling.view") ||
    ctx.hasPermission("scheduling.edit") ||
    ctx.hasPermission("bookings.view") ||
    ctx.hasPermission("bookings.edit")
  ) {
    return;
  }
  throw new BusinessApologyExceptionError("Not authorized", "unauthorized");
}

function resolveNotifyFromPublish(
  phone: string,
  publishOutcome: BookingPublishOutcome | null | undefined,
): {
  notification_status: "queued" | "failed" | "skipped";
  notification_queue_id: string | null;
  error_message: string | null;
} {
  if (!phone) {
    return {
      notification_status: "skipped",
      notification_queue_id: null,
      error_message: "Customer has no phone number for WhatsApp",
    };
  }

  if (!publishOutcome) {
    return {
      notification_status: "failed",
      notification_queue_id: null,
      error_message: "notification_publish_unavailable",
    };
  }

  if (publishOutcome.whatsappSkipped) {
    return {
      notification_status: "skipped",
      notification_queue_id: null,
      error_message: "WhatsApp channel skipped",
    };
  }

  const queueId = publishOutcome.whatsappQueueIds[0] ?? null;
  if (queueId) {
    return {
      notification_status: "queued",
      notification_queue_id: queueId,
      error_message: null,
    };
  }

  return {
    notification_status: "failed",
    notification_queue_id: null,
    error_message: publishOutcome.error ?? "whatsapp_enqueue_failed",
  };
}

export class BusinessAppointmentExceptionService {
  private readonly exceptionRepo: BusinessAppointmentExceptionRepository;
  private readonly rulesRepo: SchedulingBookingRulesRepository;

  constructor(
    private readonly client: SupabaseClient,
    private readonly bookingDomain: BookingDomainService,
    private readonly notesFactory: BusinessExceptionNotesFactory,
  ) {
    this.exceptionRepo = new BusinessAppointmentExceptionRepository(client);
    this.rulesRepo = new SchedulingBookingRulesRepository(client);
  }

  async preview(
    ctx: LoginAppPortContext,
    input: Omit<BusinessApologyExceptionInput, "idempotencyKey">,
  ): Promise<BusinessApologyPreviewResult> {
    assertCanPreview(ctx);
    const prepared = await this.prepareSelection(ctx.companyId, input);
    return {
      timezone: prepared.timezone,
      windowStartAt: prepared.windowStartAt,
      windowEndAt: prepared.windowEndAt,
      affectedAppointmentsCount: prepared.bookings.length,
      affectedCustomersCount: new Set(prepared.bookings.map((b) => b.customer_id)).size,
      appointments: prepared.bookings.map((b) => ({
        id: b.id,
        customerId: b.customer_id,
        startAt: b.start_at,
        endAt: b.end_at,
        status: b.status,
      })),
    };
  }

  async execute(
    ctx: LoginAppPortContext,
    input: BusinessApologyExceptionInput,
  ): Promise<BusinessApologyExecuteResult> {
    assertCanManage(ctx);

    const comment = input.comment.trim();
    if (!comment) {
      throw new BusinessApologyExceptionError("Comment is required", "invalid_input");
    }
    if (!input.idempotencyKey.trim()) {
      throw new BusinessApologyExceptionError("Idempotency key is required", "invalid_input");
    }

    const idempotencyKey = input.idempotencyKey.trim();
    const existing = await this.exceptionRepo.findByIdempotencyKey(ctx.companyId, idempotencyKey);
    if (existing?.status === "completed" || existing?.status === "failed") {
      return this.toExecuteResult(existing, true);
    }

    const prepared = await this.prepareSelection(ctx.companyId, input);
    let exception: BusinessAppointmentExceptionRecord;

    if (existing?.status === "pending") {
      exception = existing;
    } else {
      try {
        exception = await this.exceptionRepo.insertException({
          company_id: ctx.companyId,
          created_by: ctx.actorUserId,
          service_id: input.serviceId,
          exception_date: input.exceptionDate,
          scope: input.scope,
          start_time: prepared.startTime,
          end_time: prepared.endTime,
          comment,
          status: "pending",
          timezone: prepared.timezone,
          window_start_at: prepared.windowStartAt,
          window_end_at: prepared.windowEndAt,
          idempotency_key: idempotencyKey,
          affected_appointments_count: prepared.bookings.length,
          cancelled_appointments_count: 0,
          notification_queued_count: 0,
          notification_sent_count: 0,
          notification_failed_count: 0,
          notification_skipped_count: 0,
        });
      } catch (error) {
        // Concurrent insert with same idempotency key — reuse durable row.
        const raced = await this.exceptionRepo.findByIdempotencyKey(ctx.companyId, idempotencyKey);
        if (!raced) throw error;
        if (raced.status === "completed" || raced.status === "failed") {
          return this.toExecuteResult(raced, true);
        }
        exception = raced;
      }
    }

    const existingItems = await this.exceptionRepo.listItemsForException(exception.id, ctx.companyId);
    const itemsByBooking = new Map(existingItems.map((item) => [item.booking_id, item]));

    const notes = this.notesFactory(ctx, this.client);
    const { data: serviceRow } = await this.client
      .from("scheduling_services")
      .select("name")
      .eq("id", input.serviceId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    const serviceName = serviceRow?.name ?? input.serviceId;

    // Resume path: finalize items claimed before a crash (booking may already be cancelled
    // and therefore absent from the active-window query).
    for (const item of existingItems) {
      if (item.cancellation_status !== "pending" && item.notification_status !== "pending") {
        continue;
      }
      const { data: bookingRow } = await this.client
        .from("scheduling_bookings")
        .select("*")
        .eq("id", item.booking_id)
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      if (!bookingRow) continue;
      const booking = bookingRow as SchedulingBooking;

      if (item.cancellation_status === "pending" && booking.status === "cancelled") {
        await this.exceptionRepo.updateItem(item.id, ctx.companyId, {
          cancellation_status: "cancelled",
        });
        await this.finalizeNotificationOnly(
          ctx,
          { ...item, cancellation_status: "cancelled" },
          booking,
          comment,
        );
        continue;
      }

      if (
        item.cancellation_status === "cancelled" &&
        item.notification_status === "pending"
      ) {
        await this.finalizeNotificationOnly(ctx, item, booking, comment);
      }
    }

    // Refresh map after resume finalization.
    const refreshedItems = await this.exceptionRepo.listItemsForException(
      exception.id,
      ctx.companyId,
    );
    itemsByBooking.clear();
    for (const item of refreshedItems) {
      itemsByBooking.set(item.booking_id, item);
    }

    for (const booking of prepared.bookings) {
      const priorItem = itemsByBooking.get(booking.id);
      if (
        priorItem &&
        (priorItem.cancellation_status === "cancelled" ||
          priorItem.cancellation_status === "skipped" ||
          priorItem.cancellation_status === "failed")
      ) {
        // Already finalized for this exception (idempotent resume).
        if (
          priorItem.cancellation_status === "cancelled" &&
          priorItem.notification_status === "pending"
        ) {
          await this.finalizeNotificationOnly(ctx, priorItem, booking, comment);
        }
        continue;
      }

      const priorForeign = await this.exceptionRepo.findExistingItemForBooking(
        ctx.companyId,
        booking.id,
      );
      if (priorForeign && priorForeign.exception_id !== exception.id) {
        await this.exceptionRepo.insertItem({
          exception_id: exception.id,
          company_id: ctx.companyId,
          booking_id: booking.id,
          customer_id: booking.customer_id,
          cancellation_status: "skipped",
          notification_status: "skipped",
          error_message: "Already claimed by a prior business exception",
        });
        continue;
      }

      if (!BookingLifecycleService.canTransition(booking.status, "cancelled")) {
        // Resume: booking may already be cancelled from a prior crash after claim.
        if (booking.status === "cancelled" && priorItem?.cancellation_status === "pending") {
          await this.exceptionRepo.updateItem(priorItem.id, ctx.companyId, {
            cancellation_status: "cancelled",
          });
          await this.finalizeNotificationOnly(
            ctx,
            { ...priorItem, cancellation_status: "cancelled" },
            booking,
            comment,
          );
          continue;
        }

        if (!priorItem) {
          await this.exceptionRepo.insertItem({
            exception_id: exception.id,
            company_id: ctx.companyId,
            booking_id: booking.id,
            customer_id: booking.customer_id,
            cancellation_status: "skipped",
            notification_status: "skipped",
            error_message: `Status ${booking.status} is not cancellable`,
          });
        } else {
          await this.exceptionRepo.updateItem(priorItem.id, ctx.companyId, {
            cancellation_status: "skipped",
            notification_status: "skipped",
            error_message: `Status ${booking.status} is not cancellable`,
          });
        }
        continue;
      }

      let claim: BusinessAppointmentExceptionItemRecord | null = priorItem ?? null;
      if (!claim) {
        claim = await this.exceptionRepo.tryClaimItem({
          exception_id: exception.id,
          company_id: ctx.companyId,
          booking_id: booking.id,
          customer_id: booking.customer_id,
        });
      }

      if (!claim) {
        await this.exceptionRepo.insertItem({
          exception_id: exception.id,
          company_id: ctx.companyId,
          booking_id: booking.id,
          customer_id: booking.customer_id,
          cancellation_status: "skipped",
          notification_status: "skipped",
          error_message: "Concurrent claim by another business exception",
        });
        continue;
      }

      try {
        const { booking: updated, publishOutcome } = await this.bookingDomain.cancelBooking({
          companyId: ctx.companyId,
          bookingId: booking.id,
          updatedBy: ctx.actorUserId,
          reason: "clinic_closed",
          notes: comment,
          customerMessage: comment,
          businessExceptionId: exception.id,
          businessExceptionItemId: claim.id,
          enforceCancellationPolicy: false,
        });

        try {
          await notes.create({
            tenantId: ctx.companyId,
            entityType: "customer",
            entityId: booking.customer_id,
            createdBy: ctx.actorUserId,
            sourceModule: "scheduling",
            category: "appointment_exception",
            operationId: exception.id,
            relatedEntityType: "booking",
            relatedEntityId: booking.id,
            title: "Appointment cancelled due to business exception",
            text: [
              "Appointment cancelled due to business exception.",
              `Service: ${serviceName}`,
              `Original appointment: ${updated.start_at} (${updated.timezone})`,
              `Business comment: ${comment}`,
              `Exception ID: ${exception.id}`,
              `Booking ID: ${booking.id}`,
            ].join("\n"),
            visibility: "both",
          });
        } catch (noteError) {
          console.warn(
            "[business-exception] customer note failed",
            noteError instanceof Error ? noteError.message : noteError,
          );
        }

        const { data: customer } = await this.client
          .from("customers")
          .select("phone, phone_e164")
          .eq("id", booking.customer_id)
          .eq("company_id", ctx.companyId)
          .maybeSingle();
        const outboundPhone =
          typeof customer?.phone_e164 === "string" && customer.phone_e164.trim()
            ? customer.phone_e164.trim()
            : "";
        const notify = resolveNotifyFromPublish(outboundPhone, publishOutcome ?? null);

        await this.exceptionRepo.updateItem(claim.id, ctx.companyId, {
          cancellation_status: "cancelled",
          notification_status: notify.notification_status,
          notification_queue_id: notify.notification_queue_id,
          provider_message_id: null,
          error_message: notify.error_message,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "cancel_failed";
        // Keep any durable cancel if the failure was only on a later step.
        const { data: current } = await this.client
          .from("scheduling_bookings")
          .select("status")
          .eq("id", booking.id)
          .eq("company_id", ctx.companyId)
          .maybeSingle();

        if (current?.status === "cancelled") {
          await this.exceptionRepo.updateItem(claim.id, ctx.companyId, {
            cancellation_status: "cancelled",
            notification_status: "failed",
            error_message: message,
          });
        } else {
          await this.exceptionRepo.updateItem(claim.id, ctx.companyId, {
            cancellation_status: "failed",
            notification_status: "failed",
            error_message: message,
          });
        }
      }
    }

    await recountExceptionNotificationCounts(this.client, ctx.companyId, exception.id);

    const completed = await this.exceptionRepo.updateException(exception.id, ctx.companyId, {
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    // Parent counters were recounted above; reload for accurate result.
    const fresh =
      (await this.exceptionRepo.findByIdempotencyKey(ctx.companyId, idempotencyKey)) ?? completed;

    return this.toExecuteResult(fresh, false);
  }

  /**
   * After a crash where cancel already committed but item notify status stayed pending,
   * do not re-cancel / re-enqueue — mark failed so operators can see the gap (queue may
   * already hold the message from the first attempt).
   */
  private async finalizeNotificationOnly(
    ctx: LoginAppPortContext,
    item: BusinessAppointmentExceptionItemRecord,
    booking: SchedulingBooking,
    _comment: string,
  ): Promise<void> {
    if (item.notification_status !== "pending") return;

    const { data: customer } = await this.client
      .from("customers")
      .select("phone, phone_e164")
      .eq("id", booking.customer_id)
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    // D5.1 — eligibility requires canonical phone_e164 only (no legacy Egypt guess).
    const phone =
      typeof customer?.phone_e164 === "string" && customer.phone_e164.trim()
        ? customer.phone_e164.trim()
        : "";

    if (!phone) {
      await this.exceptionRepo.updateItem(item.id, ctx.companyId, {
        cancellation_status: "cancelled",
        notification_status: "skipped",
        error_message: "phone_identity_unresolved",
      });
      return;
    }

    // Avoid duplicate WhatsApp enqueue on resume; durable queue from first attempt (if any)
    // remains the source of truth. Mark failed for visibility when we cannot prove queued.
    if (item.notification_queue_id) {
      await this.exceptionRepo.updateItem(item.id, ctx.companyId, {
        cancellation_status: "cancelled",
        notification_status: "queued",
      });
      return;
    }

    await this.exceptionRepo.updateItem(item.id, ctx.companyId, {
      cancellation_status: "cancelled",
      notification_status: "failed",
      error_message: "notification_interrupted_before_queue_link",
    });
  }

  private async prepareSelection(
    companyId: string,
    input: Omit<BusinessApologyExceptionInput, "idempotencyKey">,
  ): Promise<{
    timezone: string;
    windowStartAt: string;
    windowEndAt: string;
    startTime: string | null;
    endTime: string | null;
    bookings: SchedulingBooking[];
  }> {
    if (!input.serviceId.trim()) {
      throw new BusinessApologyExceptionError("Service is required", "invalid_input");
    }

    const { data: service, error: serviceError } = await this.client
      .from("scheduling_services")
      .select("id, status")
      .eq("id", input.serviceId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (serviceError) throw new Error(serviceError.message);
    if (!service) {
      throw new BusinessApologyExceptionError("Service not found", "service_not_found");
    }

    const rules = await this.rulesRepo.getByCompany(companyId);
    const timezone = TimezoneResolver.resolveEffectiveTimezone(null, null, rules?.timezone ?? null);
    const window = resolveExceptionWindow({
      exceptionDate: input.exceptionDate,
      scope: input.scope,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone,
    });

    const candidates = await this.exceptionRepo.listCancellableByServiceAndWindow({
      companyId,
      serviceId: input.serviceId,
      windowStartAt: window.windowStartAt,
      windowEndAt: window.windowEndAt,
    });

    const bookings = candidates.filter(
      (booking) =>
        BookingLifecycleService.isActive(booking.status) &&
        bookingOverlapsExceptionWindow(
          booking.start_at,
          booking.end_at,
          window.windowStartAt,
          window.windowEndAt,
        ),
    );

    return {
      timezone,
      windowStartAt: window.windowStartAt,
      windowEndAt: window.windowEndAt,
      startTime: window.startTime,
      endTime: window.endTime,
      bookings,
    };
  }

  private toExecuteResult(
    record: BusinessAppointmentExceptionRecord,
    reusedExisting: boolean,
  ): BusinessApologyExecuteResult {
    const queued = record.notification_queued_count ?? 0;
    const sent = record.notification_sent_count ?? 0;
    const failed = record.notification_failed_count ?? 0;

    let messageKey: BusinessApologyExecuteResult["messageKey"];
    if (record.affected_appointments_count === 0) {
      messageKey = "zero_affected";
    } else if (reusedExisting) {
      messageKey = "already_completed";
    } else if (failed > 0 && (queued > 0 || sent > 0)) {
      messageKey = "partial_notifications";
    } else if (failed > 0 && queued === 0 && sent === 0) {
      messageKey = "partial_notifications";
    } else if (queued > 0 && sent === 0) {
      messageKey = "notifications_queued";
    } else {
      messageKey = "success";
    }

    return {
      exceptionId: record.id,
      status: record.status,
      affectedAppointmentsCount: record.affected_appointments_count,
      cancelledAppointmentsCount: record.cancelled_appointments_count,
      notificationQueuedCount: queued,
      notificationSentCount: sent,
      notificationFailedCount: failed,
      notificationSkippedCount: record.notification_skipped_count,
      reusedExisting,
      messageKey,
    };
  }
}
