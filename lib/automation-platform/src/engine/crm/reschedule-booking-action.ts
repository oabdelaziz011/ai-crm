import { ValidationError } from "../../errors.js";
import {
  buildActionVariableScope,
  resolveFieldBindingAsString,
} from "../../field-binding/resolver.js";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
import {
  buildDefaultBookingRescheduleText,
} from "../../runtime/booking-reschedule-message.js";
import { shouldQueueDefaultBookingConfirmation } from "../../runtime/booking-confirmation-message.js";
import { appendOutboundQueueEntry } from "../../runtime/outbound-queue.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveActorUserId(context: ExecutionContext): string {
  const candidates = [
    context.run.metadata?.actorUserId,
    context.session.metadata?.actorUserId,
    context.variables.__actorUserId,
  ];
  return candidates.map(readString).find(Boolean) ?? "";
}

function resolveBookingId(scope: Record<string, unknown>, binding: unknown): string {
  const booking = readRecord(scope.booking);
  const fromBooking = readString(booking?.id) ?? readString(booking?.booking_id);
  if (fromBooking) return fromBooking;
  const resolved = resolveFieldBindingAsString(binding, scope);
  if (resolved) return resolved;
  const topLevel = readString(scope.booking_id);
  if (topLevel) return topLevel;
  throw new ValidationError("Reschedule booking requires a selected booking.");
}

function resolveSelectedSlot(scope: Record<string, unknown>): { startAt: string; timezone: string } {
  const slot = readRecord(scope.selected_slot);
  const startAt = readString(slot?.start_at);
  const timezone =
    readString(slot?.timezone) ??
    readString(readRecord(scope.selected_date)?.timezone);
  if (!startAt?.includes("T") || !timezone) {
    throw new ValidationError("Reschedule booking requires a selected scheduling slot.");
  }
  return { startAt, timezone };
}

export async function executeRescheduleBookingAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  bookingService: BookingServicePort,
): Promise<NodeExecutionResult> {
  if (!bookingService.rescheduleBooking) {
    throw new ValidationError("Reschedule booking requires a scheduling-aware booking service.");
  }

  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const selectedBooking = readRecord(scope.booking) ?? {};
  const selectedDate = readRecord(scope.selected_date);
  const selectedSlot = readRecord(scope.selected_slot);
  const bookingId = resolveBookingId(
    scope,
    config.bookingId ?? config.booking ?? { mode: "variable", variable: "{{booking.id}}" },
  );
  const schedulingSlot = resolveSelectedSlot(scope);

  const result = await bookingService.rescheduleBooking({
    companyId: context.company.id,
    userId: resolveActorUserId(context),
    bookingId,
    schedulingSlot,
  });

  const confirmationNumber =
    readString(result.confirmationNumber) ??
    readString(selectedBooking.confirmation_number) ??
    readString(selectedBooking.confirmation_code);
  if (!confirmationNumber) {
    throw new ValidationError("Rescheduled booking is missing its confirmation number.");
  }

  const booking = {
    ...selectedBooking,
    id: result.booking.id,
    booking_id: result.booking.id,
    customer_id: result.booking.customerId,
    service: result.booking.service,
    service_id: readString(selectedBooking.service_id) ?? result.booking.service,
    doctor_id: result.booking.doctorId,
    resource_id: readString(selectedBooking.resource_id) ?? result.booking.doctorId,
    location_id: result.booking.locationId,
    booking_date: result.booking.bookingDate,
    date:
      readString(selectedDate?.display_date) ??
      readString(selectedDate?.date) ??
      result.booking.bookingDate.slice(0, 10),
    display_date:
      readString(selectedDate?.display_date) ??
      readString(selectedDate?.date) ??
      result.booking.bookingDate.slice(0, 10),
    time: readString(selectedSlot?.display_time),
    display_time: readString(selectedSlot?.display_time),
    duration_minutes: result.booking.durationMinutes,
    notes: result.booking.notes,
    status: result.booking.status,
    confirmation_code: confirmationNumber,
    confirmation_number: confirmationNumber,
    rescheduled_from_id: result.previousBookingId,
    timezone: schedulingSlot.timezone,
  };

  let variables = mergeVariables(context.variables, {
    booking,
    booking_id: result.booking.id,
    booking_date: result.booking.bookingDate,
    rescheduled_from_id: result.previousBookingId,
  });
  if (
    shouldQueueDefaultBookingConfirmation({
      currentNodeId: context.currentNode.id,
      nodes: context.nodes,
      edges: context.edges,
    })
  ) {
    const message = buildDefaultBookingRescheduleText(variables);
    if (message) variables = appendOutboundQueueEntry(variables, { kind: "text", text: message });
  }

  return {
    outcome: "continue",
    variables,
    output: {
      bookingId: result.booking.id,
      previousBookingId: result.previousBookingId,
      booking,
    },
  };
}
