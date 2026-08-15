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

function readRecordString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function readRecordNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  if (typeof field === "number" && Number.isFinite(field)) return field;
  if (typeof field === "string" && field.trim()) {
    const parsed = Number(field);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildCreatedBookingVariablePatch(input: {
  bookingId: string;
  bookingDate: string;
  confirmationNumber?: string | null;
  customerId: string;
  service: string;
  resourceId: string;
  locationId: string;
  durationMinutes: number | null;
  notes: string | null;
  scope: Record<string, unknown>;
}): Record<string, unknown> {
  const serviceName =
    readRecordString(input.scope.selected_service, "name") ??
    (UUID_PATTERN.test(input.service) ? null : input.service);
  const resourceName = readRecordString(input.scope.selected_resource, "name");
  const customerName = readRecordString(input.scope.customer, "name");
  const displayDate =
    readRecordString(input.scope.selected_date, "display_date") ??
    readRecordString(input.scope.selected_date, "date") ??
    input.bookingDate.slice(0, 10);
  const displayTime = readRecordString(input.scope.selected_slot, "display_time");
  const durationMinutes =
    input.durationMinutes ??
    readRecordNumber(input.scope.selected_slot, "duration_minutes") ??
    readRecordNumber(input.scope.selected_service, "duration_minutes");
  const timezone =
    readRecordString(input.scope.selected_slot, "timezone") ??
    readRecordString(input.scope.selected_date, "timezone");
  const confirmationNumber =
    (typeof input.confirmationNumber === "string" && input.confirmationNumber.trim()
      ? input.confirmationNumber.trim()
      : null) ??
    `BK-${input.bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

  const booking = {
    exists: true,
    id: input.bookingId,
    booking_id: input.bookingId,
    confirmation_code: confirmationNumber,
    confirmation_number: confirmationNumber,
    customer_id: input.customerId,
    customer_name: customerName,
    service: serviceName ?? input.service,
    service_id: input.service,
    service_name: serviceName,
    // Legacy clinic-oriented alias — keep for existing flows.
    doctor_id: input.resourceId,
    doctor_name: resourceName,
    resource_id: input.resourceId,
    resource_name: resourceName,
    location_id: input.locationId,
    booking_date: input.bookingDate,
    date: displayDate,
    display_date: displayDate,
    time: displayTime,
    display_time: displayTime,
    duration_minutes: durationMinutes,
    timezone,
    notes: input.notes,
    status: "confirmed",
  };

  return {
    booking_id: input.bookingId,
    booking_date: input.bookingDate,
    booking,
  };
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
    const locationId = resolveRequiredFieldBindingAsString(normalized.location, scope, "location");
    const durationMinutes = readOptionalDurationMinutes(normalized.duration, scope);
    const notes = readOptionalBindingString(normalized.notes, scope);

    const result = await bookingService.createBooking({
      companyId: context.company.id,
      userId: resolveActorUserId(context),
      service,
      doctorId,
      locationId,
      appointmentDate: resolveCreateBookingAppointmentDate(scope, normalized.appointmentDate),
      appointmentTime: resolveCreateBookingAppointmentTime(scope, normalized.appointmentTime),
      customerId,
      durationMinutes,
      notes,
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

    const bookingVariables = buildCreatedBookingVariablePatch({
      bookingId: result.bookingId,
      bookingDate: result.bookingDate,
      confirmationNumber: result.confirmationNumber,
      customerId,
      service,
      resourceId: doctorId,
      locationId,
      durationMinutes,
      notes,
      scope,
    });

    return {
      outcome: "continue" as const,
      variables: mergeVariables(context.variables, bookingVariables),
      output: {
        bookingId: result.bookingId,
        bookingDate: result.bookingDate,
        booking: bookingVariables.booking,
      },
    };
  });
}
