import { ValidationError } from "../../errors.js";
import {
  buildActionVariableScope,
  coerceBindingStringValue,
  resolveFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { normalizeRescheduleBookingConfig } from "../../crm/reschedule-booking-config.js";
import type {
  RescheduleBookingInput,
  RescheduleBookingRecord,
  RescheduleBookingResult,
} from "../../crm/types/reschedule-booking-input.js";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveActorUserId(context: ExecutionContext): string | null {
  const candidates = [
    context.run.metadata?.actorUserId,
    context.session.metadata?.actorUserId,
    context.variables.__actorUserId,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function readEntityId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function resolveBookingId(scope: Record<string, unknown>, binding: unknown): string {
  const fromBinding = isFieldBindingPresent(binding) ? resolveFieldBindingAsString(binding, scope) : "";
  if (fromBinding) return fromBinding;

  const fromBooking = readEntityId(scope.booking);
  if (fromBooking) return fromBooking;

  const topLevel = scope.booking_id;
  if (typeof topLevel === "string" && topLevel.trim()) return topLevel.trim();

  throw new ValidationError("Reschedule booking requires bookingId.");
}

function isFieldBindingPresent(binding: unknown): boolean {
  return Boolean(binding && typeof binding === "object");
}

function resolveDate(scope: Record<string, unknown>, binding: unknown): string {
  const fromBinding = isFieldBindingPresent(binding) ? resolveFieldBindingAsString(binding, scope) : "";
  if (fromBinding) return fromBinding;

  const selectedDate = scope.selected_date;
  const fromSelected = coerceBindingStringValue(selectedDate);
  if (fromSelected) return fromSelected;

  throw new ValidationError("Reschedule booking requires date.");
}

function resolveSlotStart(scope: Record<string, unknown>, binding: unknown): string {
  if (isFieldBindingPresent(binding)) {
    const fromBinding = resolveFieldBindingAsString(binding, scope);
    if (fromBinding) return fromBinding;
  }

  const slot = scope.selected_slot;
  if (slot && typeof slot === "object" && !Array.isArray(slot)) {
    const record = slot as Record<string, unknown>;
    const startAt = readString(record.start_at);
    if (startAt) return startAt;
    const start = readString(record.start);
    if (start) return start;
  }

  throw new ValidationError("Reschedule booking requires slotStart.");
}

function resolveTimezone(scope: Record<string, unknown>): string | null {
  const slot = scope.selected_slot;
  if (slot && typeof slot === "object" && !Array.isArray(slot)) {
    const timezone = readString((slot as { timezone?: unknown }).timezone);
    if (timezone) return timezone;
  }
  const selectedDate = scope.selected_date;
  if (selectedDate && typeof selectedDate === "object" && !Array.isArray(selectedDate)) {
    const timezone = readString((selectedDate as { timezone?: unknown }).timezone);
    if (timezone) return timezone;
  }
  return null;
}

function isBookingDomainError(error: unknown): error is { codes: string[]; name: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "BookingDomainError" &&
    Array.isArray((error as { codes?: unknown }).codes)
  );
}

function readOptionalRecordField(record: RescheduleBookingRecord, key: keyof RescheduleBookingRecord): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildSuccessVariables(
  result: RescheduleBookingResult,
  input: RescheduleBookingInput,
): Record<string, unknown> {
  const booking = result.booking;
  const previous = result.previousBooking;
  const reference = readOptionalRecordField(booking, "confirmation_number");

  const reschedule = {
    success: true,
    bookingId: booking.id,
    previousBookingId: previous.id,
    previousStartAt: previous.start_at,
    previousStatus: previous.status,
    startAt: booking.start_at,
    endAt: booking.end_at ?? null,
    timezone: booking.timezone ?? null,
    status: booking.status,
    serviceId: booking.service_id ?? null,
    resourceId: booking.resource_id ?? null,
    customerId: booking.customer_id ?? null,
    reference,
    date: input.date,
    slotStart: input.slotStart,
  };

  return {
    reschedule,
    booking_id: booking.id,
    booking: {
      id: booking.id,
      status: booking.status,
      start_at: booking.start_at,
      end_at: booking.end_at ?? null,
      timezone: booking.timezone ?? null,
      service_id: booking.service_id ?? null,
      resource_id: booking.resource_id ?? null,
      customer_id: booking.customer_id ?? null,
      confirmation_code: reference,
      confirmation_number: reference,
      rescheduled_from_id: booking.rescheduled_from_id ?? previous.id,
      previous_id: previous.id,
      previous_start_at: previous.start_at,
      previous_status: previous.status,
    },
  };
}

function buildFailureResult(
  context: ExecutionContext,
  codes: string[],
  message: string,
): NodeExecutionResult {
  const uniqueCodes = [...new Set(codes.filter((code) => code.trim()))];
  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      reschedule: {
        success: false,
        errors: uniqueCodes,
        message,
      },
    }),
    errorMessage: message,
    output: {
      success: false,
      errors: uniqueCodes,
      message,
    },
  };
}

export async function executeRescheduleBookingAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  bookingService: BookingServicePort,
): Promise<NodeExecutionResult> {
  if (typeof bookingService.rescheduleBooking !== "function") {
    throw new ValidationError(
      "Reschedule booking action requires a scheduling reschedule service.",
    );
  }

  const normalized = normalizeRescheduleBookingConfig(config);
  const scope = buildActionVariableScope(context.variables, context.customer.id);

  const bookingId = resolveBookingId(scope, normalized.bookingId);
  const date = resolveDate(scope, normalized.date);
  const slotStart = resolveSlotStart(scope, normalized.slotStart);

  const input: RescheduleBookingInput = {
    companyId: context.company.id,
    bookingId,
    date,
    slotStart,
    updatedBy: resolveActorUserId(context),
    timezone: resolveTimezone(scope),
  };

  try {
    const result = await bookingService.rescheduleBooking(input);
    const variables = buildSuccessVariables(result, input);
    return {
      outcome: "continue",
      variables: mergeVariables(context.variables, variables),
      output: {
        success: true,
        ...(variables.reschedule as Record<string, unknown>),
      },
    };
  } catch (error) {
    if (isBookingDomainError(error)) {
      return buildFailureResult(context, error.codes, error.codes.join(", ") || error.message);
    }
    if (error instanceof Error && error.message.startsWith("INVALID_STATUS_TRANSITION:")) {
      return buildFailureResult(context, ["invalid_status_transition"], error.message);
    }
    throw error;
  }
}
