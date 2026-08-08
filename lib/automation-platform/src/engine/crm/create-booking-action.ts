import { ValidationError } from "../../errors.js";
import {
  buildActionVariableScope,
  coerceBindingStringValue,
  resolveFieldBindingAsString,
  resolveRequiredFieldBindingAsString,
} from "../../field-binding/resolver.js";
import { normalizeCreateBookingConfig } from "../../crm/create-booking-config.js";
import type { CreateBookingSchedulingSlot } from "../../crm/types/create-booking-input.js";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
import type { ExecutionContext, NodeExecutionResult } from "../execution-context.js";
import { mergeVariables } from "../execution-context.js";
import { waPerfMeasure } from "../../debug/whatsapp-pipeline-perf.js";

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readEntityId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function resolveCustomerId(scope: Record<string, unknown>, binding: unknown): string {
  const fromCustomer = readEntityId(scope.customer);
  if (fromCustomer) return fromCustomer;

  const resolved = resolveRequiredFieldBindingAsString(binding, scope, "customer");
  if (resolved) return resolved;

  throw new ValidationError("Create booking requires a valid customer id.");
}

function resolveCreateBookingService(
  scope: Record<string, unknown>,
  binding: unknown,
): string {
  const fromSlot = readSelectedSlotScheduling(scope)?.serviceId;
  if (fromSlot) return fromSlot;

  const fromSelected = readEntityId(scope.selected_service);
  if (fromSelected) return fromSelected;

  const resolved = resolveFieldBindingAsString(binding, scope);
  if (resolved) return resolved;

  const selectedService = coerceBindingStringValue(scope.selected_service);
  if (selectedService) return selectedService;

  throw new ValidationError("Create booking requires service.");
}

function resolveCreateBookingDoctorId(
  scope: Record<string, unknown>,
  binding: unknown,
): string {
  const fromSlot = readSelectedSlotScheduling(scope)?.resourceId;
  if (fromSlot) return fromSlot;

  const fromSelected = readEntityId(scope.selected_resource);
  if (fromSelected) return fromSelected;

  const resolved = resolveFieldBindingAsString(binding, scope);
  // Allow legacy "unspecified" when no scheduling resource/slot is available.
  if (resolved) return resolved;

  throw new ValidationError("Create booking requires doctor.");
}

function readSelectedSlotStartAt(scope: Record<string, unknown>): string | null {
  const slot = scope.selected_slot;
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) return null;
  const startAt = (slot as { start_at?: unknown }).start_at;
  return typeof startAt === "string" && startAt.includes("T") ? startAt.trim() : null;
}

function readSelectedSlotScheduling(scope: Record<string, unknown>): CreateBookingSchedulingSlot | null {
  const slot = scope.selected_slot;
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) return null;
  const record = slot as Record<string, unknown>;
  const startAt = typeof record.start_at === "string" ? record.start_at.trim() : "";
  const timezone = typeof record.timezone === "string" ? record.timezone.trim() : "";
  const serviceId = typeof record.service_id === "string" ? record.service_id.trim() : "";
  const resourceId = typeof record.resource_id === "string" ? record.resource_id.trim() : "";
  if (!startAt.includes("T") || !timezone || !serviceId || !resourceId) return null;
  return { startAt, timezone, serviceId, resourceId };
}

function resolveCreateBookingAppointmentDate(
  scope: Record<string, unknown>,
  binding: unknown,
): string {
  const startAt = readSelectedSlotStartAt(scope);
  if (startAt) return startAt.slice(0, 10);

  const resolved = resolveFieldBindingAsString(binding, scope);
  if (resolved) return resolved;

  throw new ValidationError("Create booking requires appointment date.");
}

function resolveCreateBookingAppointmentTime(
  scope: Record<string, unknown>,
  binding: unknown,
): string {
  const startAt = readSelectedSlotStartAt(scope);
  if (startAt) return startAt;

  const resolved = resolveFieldBindingAsString(binding, scope);
  if (resolved) return resolved;

  throw new ValidationError("Create booking requires appointment time.");
}

export async function executeCreateBookingAction(
  context: ExecutionContext,
  config: Record<string, unknown>,
  bookingService: BookingServicePort,
): Promise<NodeExecutionResult> {
  return waPerfMeasure("Booking creation", async () => {
    const normalized = normalizeCreateBookingConfig(config);
    const scope = buildActionVariableScope(context.variables, context.customer.id);

    const schedulingSlot = readSelectedSlotScheduling(scope);
    const service = resolveCreateBookingService(scope, normalized.service);
    const doctorId = resolveCreateBookingDoctorId(scope, normalized.doctor);
    const customerId = resolveCustomerId(scope, normalized.customer);

    const result = await bookingService.createBooking({
      companyId: context.company.id,
      userId: resolveActorUserId(context),
      service,
      doctorId,
      locationId: resolveRequiredFieldBindingAsString(normalized.location, scope, "location"),
      appointmentDate: resolveCreateBookingAppointmentDate(scope, normalized.appointmentDate),
      appointmentTime: resolveCreateBookingAppointmentTime(scope, normalized.appointmentTime),
      customerId,
      durationMinutes: readOptionalDurationMinutes(normalized.duration, scope),
      notes: readOptionalBindingString(normalized.notes, scope),
      schedulingSlot: schedulingSlot
        ? {
            ...schedulingSlot,
            serviceId: schedulingSlot.serviceId || service,
            resourceId: schedulingSlot.resourceId || doctorId,
          }
        : UUID_PATTERN.test(service) && UUID_PATTERN.test(doctorId)
          ? {
              startAt: resolveCreateBookingAppointmentTime(scope, normalized.appointmentTime),
              timezone:
                typeof (scope.selected_date as { timezone?: unknown } | undefined)?.timezone ===
                "string"
                  ? String((scope.selected_date as { timezone: string }).timezone)
                  : typeof (scope.selected_slot as { timezone?: unknown } | undefined)?.timezone ===
                      "string"
                    ? String((scope.selected_slot as { timezone: string }).timezone)
                    : "UTC",
              serviceId: service,
              resourceId: doctorId,
            }
          : null,
    });

    return {
      outcome: "continue" as const,
      variables: mergeVariables(context.variables, {
        booking_id: result.bookingId,
        booking_date: result.bookingDate,
      }),
      output: {
        bookingId: result.bookingId,
        bookingDate: result.bookingDate,
      },
    };
  });
}
