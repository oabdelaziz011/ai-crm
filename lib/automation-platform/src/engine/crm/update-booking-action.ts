import { ValidationError } from "../../errors.js";
import {
  buildActionVariableScope,
  resolveFieldBindingAsString,
  resolveRequiredFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { normalizeUpdateBookingConfig } from "../../crm/update-booking-config.js";
import {
  buildBookingEntityFields,
} from "../../crm/lookup/output-variables.js";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveActorUserId(context: ExecutionContext): string {
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

  return "";
}

function readBookingId(scope: Record<string, unknown>, binding: unknown): string {
  const resolved = resolveRequiredFieldBindingAsString(binding, scope, "booking id");
  if (/^[0-9a-f-]{36}$/i.test(resolved)) return resolved;

  const booking = scope.booking;
  if (booking && typeof booking === "object" && !Array.isArray(booking)) {
    const id = (booking as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }

  const topLevel = scope.booking_id;
  if (typeof topLevel === "string" && topLevel.trim()) return topLevel.trim();

  return resolved;
}

export async function executeUpdateBookingAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  bookingService: BookingServicePort,
): Promise<NodeExecutionResult> {
  const normalized = normalizeUpdateBookingConfig(config);
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const field = readString(normalized.field) ?? readString(config.field);
  if (!field) throw new ValidationError("Update booking requires config.field.");

  const bookingId = readBookingId(scope, normalized.bookingId);
  const value =
    typeof normalized.value === "object" && normalized.value !== null && "mode" in (normalized.value as object)
      ? resolveRequiredFieldBindingAsString(normalized.value, scope, "value")
      : readString(config.value) ?? resolveFieldBindingAsString({ mode: "variable", variable: `{{${field}}}` }, scope);

  const result = await bookingService.updateBooking({
    companyId: context.company.id,
    userId: resolveActorUserId(context),
    bookingId,
    field,
    value,
  });

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      ...buildBookingEntityFields({
        exists: true,
        id: result.booking.id,
        customerId: result.booking.customerId,
        service: result.booking.service,
        doctorId: result.booking.doctorId,
        locationId: result.booking.locationId,
        bookingDate: result.booking.bookingDate,
        durationMinutes: result.booking.durationMinutes,
        notes: result.booking.notes,
        status: result.booking.status,
      }),
      booking_id: result.booking.id,
      booking_date: result.booking.bookingDate,
    }),
    output: { bookingId: result.booking.id, field },
  };
}

export async function executeCancelBookingAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  bookingService: BookingServicePort,
): Promise<NodeExecutionResult> {
  const scope = buildActionVariableScope(context.variables, context.customer.id);
  const bookingId = readBookingId(scope, config.bookingId ?? { mode: "variable", variable: "{{booking_id}}" });

  const result = await bookingService.cancelBooking({
    companyId: context.company.id,
    userId: resolveActorUserId(context),
    bookingId,
  });

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      ...buildBookingEntityFields({
        exists: true,
        id: result.booking.id,
        customerId: result.booking.customerId,
        service: result.booking.service,
        doctorId: result.booking.doctorId,
        locationId: result.booking.locationId,
        bookingDate: result.booking.bookingDate,
        durationMinutes: result.booking.durationMinutes,
        notes: result.booking.notes,
        status: result.booking.status,
      }),
      booking_id: result.booking.id,
      booking_date: result.booking.bookingDate,
    }),
    output: { bookingId: result.booking.id, status: result.booking.status },
  };
}
