import { ValidationError } from "../../errors.js";
import {
  buildActionVariableScope,
  resolveFieldBindingAsString,
  resolveRequiredFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { normalizeCreateBookingConfig } from "../../crm/create-booking-config.js";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";

function readOptionalDurationMinutes(binding: unknown, scope: Record<string, unknown>): number | null {
  if (binding == null) return null;
  const resolved = resolveFieldBindingAsString(binding, scope);
  if (!resolved) return null;
  const parsed = Number(resolved);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ValidationError("Create booking duration must be a positive number of minutes.");
  }
  return Math.round(parsed);
}

function readOptionalBindingString(binding: unknown, scope: Record<string, unknown>): string | null {
  if (binding == null) return null;
  const resolved = resolveFieldBindingAsString(binding, scope);
  return resolved || null;
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

export async function executeCreateBookingAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  bookingService: BookingServicePort,
): Promise<NodeExecutionResult> {
  const normalized = normalizeCreateBookingConfig(config);
  const scope = buildActionVariableScope(context.variables, context.customer.id);

  const result = await bookingService.createBooking({
    companyId: context.company.id,
    userId: resolveActorUserId(context),
    service: resolveRequiredFieldBindingAsString(normalized.service, scope, "service"),
    doctorId: resolveRequiredFieldBindingAsString(normalized.doctor, scope, "doctor"),
    locationId: resolveRequiredFieldBindingAsString(normalized.location, scope, "location"),
    appointmentDate: resolveRequiredFieldBindingAsString(normalized.appointmentDate, scope, "appointment date"),
    appointmentTime: resolveRequiredFieldBindingAsString(normalized.appointmentTime, scope, "appointment time"),
    customerId: resolveRequiredFieldBindingAsString(normalized.customer, scope, "customer"),
    durationMinutes: readOptionalDurationMinutes(normalized.duration, scope),
    notes: readOptionalBindingString(normalized.notes, scope),
  });

  return {
    outcome: "continue",
    variables: mergeVariables(context.variables, {
      booking_id: result.bookingId,
      booking_date: result.bookingDate,
    }),
    output: {
      bookingId: result.bookingId,
      bookingDate: result.bookingDate,
    },
  };
}
