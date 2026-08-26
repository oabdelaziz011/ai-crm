import type { SupabaseClient } from "@supabase/supabase-js";
import type { SlotGenerationEngine } from "@/lib/scheduling/slot-generation-engine/slot-generation-engine";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";
import { BookingValidationService } from "@/lib/scheduling/booking-domain/booking-validation-service";
import { BookingLifecycleService } from "@/lib/scheduling/booking-domain/booking-lifecycle-service";
import {
  createBookingCancelledEvent,
  createBookingCompletedEvent,
  createBookingCreatedEvent,
  createBookingRescheduledEvent,
  createBookingCheckedInEvent,
  createBookingNoShowEvent,
  createBookingStatusChangedEvent,
  type BookingEventPublisher,
  NoOpBookingEventPublisher,
} from "@/lib/scheduling/booking-domain/events";
import type {
  BookingMutationContext,
  CancelBookingInput,
  CancelBookingResult,
  CheckInBookingResult,
  MarkNoShowBookingResult,
  CompleteBookingResult,
  CreateBookingInput,
  CreateBookingResult,
  RescheduleBookingInput,
  RescheduleBookingResult,
  BookingValidationResult,
  SchedulingBookingStatus,
  TransitionBookingResult,
} from "@/lib/scheduling/booking-domain/types";

export class BookingDomainService {
  private readonly bookingRepo: BookingRepository;
  private readonly validationService: BookingValidationService;

  constructor(
    client: SupabaseClient,
    slotEngine: SlotGenerationEngine,
    private readonly eventPublisher: BookingEventPublisher = new NoOpBookingEventPublisher(),
  ) {
    this.bookingRepo = new BookingRepository(client);
    this.validationService = new BookingValidationService(client, slotEngine);
  }

  async validateBooking(
    input: Omit<CreateBookingInput, "source" | "notes" | "createdBy" | "branchId"> & {
      excludeBookingId?: string;
    },
  ): Promise<BookingValidationResult> {
    const precheck = this.validationService.validateCreateInput({
      ...input,
      source: "crm",
    });
    if (precheck) return precheck;

    return this.validationService.validateBooking({
      companyId: input.companyId,
      customerId: input.customerId,
      resourceId: input.resourceId,
      serviceId: input.serviceId,
      date: input.date,
      slotStart: input.slotStart,
      referenceNow: input.referenceNow,
      excludeBookingId: input.excludeBookingId,
    });
  }

  async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
    const precheck = this.validationService.validateCreateInput(input);
    if (precheck) {
      throw new BookingDomainError(precheck.errors);
    }

    const validation = await this.validationService.validateBooking({
      companyId: input.companyId,
      customerId: input.customerId,
      resourceId: input.resourceId,
      serviceId: input.serviceId,
      date: input.date,
      slotStart: input.slotStart,
      referenceNow: input.referenceNow,
      pricingRuleId: input.pricingRuleId,
      visitType: input.visitType,
    });

    if (!validation.valid || !validation.context) {
      throw new BookingDomainError(validation.errors);
    }

    const conflict = await this.bookingRepo.findOverlapping(
      input.companyId,
      input.resourceId,
      validation.context.startAt,
      validation.context.endAt,
    );
    if (conflict) {
      throw new BookingDomainError(["booking_conflict"]);
    }

    // Booking never calculates price — copy immutable snapshot from pricing rule.
    const snapshot = await this.validationService.resolvePricingSnapshot(
      input.companyId,
      input.serviceId,
      { pricingRuleId: input.pricingRuleId, visitType: input.visitType },
    );
    const visitType = String(input.visitType ?? snapshot.typeCode ?? "New").trim() || "New";

    const booking = await this.bookingRepo.create({
      company_id: input.companyId,
      branch_id: input.branchId ?? validation.context.branchId,
      customer_id: input.customerId,
      resource_id: input.resourceId,
      service_id: input.serviceId,
      start_at: validation.context.startAt,
      end_at: validation.context.endAt,
      timezone: validation.context.timezone,
      status: "confirmed",
      source: input.source,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
      updated_by: input.createdBy ?? null,
      amount_cents: snapshot.priceCents,
      currency: snapshot.currency,
      visit_type: visitType,
      payment_status: "pending",
      discount_cents: 0,
      tax_cents: 0,
    });

    await this.eventPublisher.publish(createBookingCreatedEvent(booking));
    return { booking };
  }

  async cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult> {
    const booking = await this.requireBooking(input.companyId, input.bookingId);
    BookingLifecycleService.assertTransition(booking.status, "cancelled");

    if (input.enforceCancellationPolicy !== false) {
      const policyCheck = await this.validationService.validateCancellation({
        companyId: input.companyId,
        booking,
        referenceNow: input.referenceNow,
      });
      if (!policyCheck.valid) {
        throw new BookingDomainError(policyCheck.errors);
      }
    }

    const cancellationNote = buildCancellationNote(input.reason, input.notes, booking.notes);

    const updated = await this.bookingRepo.updateStatus(
      booking.id,
      input.companyId,
      "cancelled",
      input.updatedBy ?? null,
      cancellationNote,
    );

    await this.eventPublisher.publish(
      createBookingCancelledEvent(updated, input.reason ?? input.notes ?? null),
    );
    return { booking: updated };
  }

  async checkInBooking(input: BookingMutationContext): Promise<CheckInBookingResult> {
    const booking = await this.requireBooking(input.companyId, input.bookingId);
    BookingLifecycleService.assertTransition(booking.status, "checked_in");

    const updated = await this.bookingRepo.updateStatus(
      booking.id,
      input.companyId,
      "checked_in",
      input.updatedBy ?? null,
    );

    await this.eventPublisher.publish(createBookingCheckedInEvent(updated));
    return { booking: updated };
  }

  async markNoShowBooking(
    input: BookingMutationContext & { gracePeriodMinutes?: number },
  ): Promise<MarkNoShowBookingResult> {
    const booking = await this.requireBooking(input.companyId, input.bookingId);
    BookingLifecycleService.assertTransition(booking.status, "no_show");

    const updated = await this.bookingRepo.updateStatus(
      booking.id,
      input.companyId,
      "no_show",
      input.updatedBy ?? null,
    );

    await this.eventPublisher.publish(
      createBookingNoShowEvent(updated, input.gracePeriodMinutes ?? 0),
    );
    return { booking: updated };
  }

  async completeBooking(input: BookingMutationContext): Promise<CompleteBookingResult> {
    const booking = await this.requireBooking(input.companyId, input.bookingId);
    BookingLifecycleService.assertTransition(booking.status, "completed");

    const updated = await this.bookingRepo.updateStatus(
      booking.id,
      input.companyId,
      "completed",
      input.updatedBy ?? null,
    );

    await this.eventPublisher.publish(createBookingCompletedEvent(updated));
    return { booking: updated };
  }

  async transitionBookingStatus(
    input: BookingMutationContext & { toStatus: SchedulingBookingStatus; note?: string | null },
  ): Promise<TransitionBookingResult> {
    const booking = await this.requireBooking(input.companyId, input.bookingId);
    BookingLifecycleService.assertTransition(booking.status, input.toStatus);
    const fromStatus = booking.status;

    const note = input.note
      ? [booking.notes, input.note].filter(Boolean).join("\n")
      : booking.notes;

    const updated = await this.bookingRepo.updateStatus(
      booking.id,
      input.companyId,
      input.toStatus,
      input.updatedBy ?? null,
      note,
    );

    await this.eventPublisher.publish(
      createBookingStatusChangedEvent(updated, fromStatus, input.toStatus),
    );
    return { booking: updated };
  }

  async sendToNurse(input: BookingMutationContext): Promise<TransitionBookingResult> {
    return this.transitionBookingStatus({ ...input, toStatus: "with_nurse" });
  }

  async sendToDoctor(input: BookingMutationContext): Promise<TransitionBookingResult> {
    return this.transitionBookingStatus({ ...input, toStatus: "in_progress" });
  }

  async archiveBooking(input: BookingMutationContext): Promise<TransitionBookingResult> {
    return this.transitionBookingStatus({ ...input, toStatus: "archived" });
  }

  async completeTriage(input: BookingMutationContext): Promise<TransitionBookingResult> {
    const booking = await this.requireBooking(input.companyId, input.bookingId);
    if (booking.status !== "with_nurse") {
      throw new Error(`INVALID_STATUS_TRANSITION:${booking.status}->triage_complete`);
    }
    const marker = "[clinic:triage_complete]";
    if (booking.notes?.includes(marker)) {
      return { booking };
    }
    const note = [booking.notes, marker].filter(Boolean).join("\n");
    const updated = await this.bookingRepo.updateStatus(
      booking.id,
      input.companyId,
      "with_nurse",
      input.updatedBy ?? null,
      note,
    );
    await this.eventPublisher.publish(
      createBookingStatusChangedEvent(updated, "with_nurse", "with_nurse"),
    );
    return { booking: updated };
  }

  async rescheduleBooking(input: RescheduleBookingInput): Promise<RescheduleBookingResult> {
    const precheck = this.validationService.validateRescheduleInput(input);
    if (precheck) {
      throw new BookingDomainError(precheck.errors);
    }

    const existing = await this.requireBooking(input.companyId, input.bookingId);
    BookingLifecycleService.assertTransition(existing.status, "rescheduled");

    const policyCheck = await this.validationService.validateReschedulePolicy({
      companyId: input.companyId,
      booking: existing,
      referenceNow: input.referenceNow,
    });
    if (!policyCheck.valid) {
      throw new BookingDomainError(policyCheck.errors);
    }

    const validation = await this.validationService.validateBooking({
      companyId: input.companyId,
      customerId: existing.customer_id,
      resourceId: existing.resource_id,
      serviceId: existing.service_id,
      date: input.date,
      slotStart: input.slotStart,
      referenceNow: input.referenceNow,
      excludeBookingId: existing.id,
    });

    if (!validation.valid || !validation.context) {
      throw new BookingDomainError(validation.errors);
    }

    const previousBooking = await this.bookingRepo.updateStatus(
      existing.id,
      input.companyId,
      "rescheduled",
      input.updatedBy ?? null,
    );

    const preservedConfirmation =
      typeof existing.confirmation_number === "string" && existing.confirmation_number.trim()
        ? existing.confirmation_number.trim()
        : null;

    const booking = await this.bookingRepo.create({
      company_id: input.companyId,
      branch_id: previousBooking.branch_id,
      customer_id: previousBooking.customer_id,
      resource_id: previousBooking.resource_id,
      service_id: previousBooking.service_id,
      start_at: validation.context.startAt,
      end_at: validation.context.endAt,
      timezone: validation.context.timezone,
      status: "confirmed",
      source: previousBooking.source,
      notes: previousBooking.notes,
      rescheduled_from_id: previousBooking.id,
      ...(preservedConfirmation ? { confirmation_number: preservedConfirmation } : {}),
      created_by: input.updatedBy ?? previousBooking.created_by,
      updated_by: input.updatedBy ?? null,
    });

    await this.eventPublisher.publish(
      createBookingRescheduledEvent(previousBooking, booking),
    );

    return { previousBooking, booking };
  }

  private async requireBooking(companyId: string, bookingId: string) {
    const booking = await this.bookingRepo.getById(bookingId, companyId);
    if (!booking) {
      throw new BookingDomainError(["booking_not_found"]);
    }
    return booking;
  }
}

export class BookingDomainError extends Error {
  constructor(readonly codes: import("@/lib/scheduling/booking-domain/types").BookingValidationErrorCode[]) {
    super(codes.join(", "));
    this.name = "BookingDomainError";
  }
}

function buildCancellationNote(
  reason: string | null | undefined,
  notes: string | null | undefined,
  existingNotes: string | null,
): string | null {
  const parts = [existingNotes, reason ? `[Cancellation: ${reason}]` : null, notes]
    .filter((part) => part && part.trim().length > 0)
    .map((part) => part!.trim());
  return parts.length > 0 ? parts.join("\n") : existingNotes;
}
