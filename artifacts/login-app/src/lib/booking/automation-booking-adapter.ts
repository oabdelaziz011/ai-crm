import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingServicePort } from "@workspace/automation-platform";
import { createSupabaseBookingServicePort } from "@/lib/crm/supabase-booking-service-adapter";
import { BookingFactory } from "@/lib/scheduling/booking-domain";
import { BookingDomainError } from "@/lib/scheduling/booking-domain";
import type { CreateBookingInput as DomainCreateInput } from "@/lib/scheduling/booking-domain";
import { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import type { CreateBookingInput, CreateBookingResult } from "@workspace/automation-platform";
import type { CancelBookingInput, CancelBookingResult } from "@workspace/automation-platform";
import type { FindBookingInput, FindBookingResult } from "@workspace/automation-platform";
import type {
  RescheduleBookingInput,
  RescheduleBookingResult,
} from "@workspace/automation-platform";
import type { SupabaseBookingServicePortOptions } from "@workspace/automation-platform";
import { wxRecordDependencyConstruction, wxRecordServiceResolution } from "@workspace/automation-platform";

import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import {
  findSchedulingBookingsForLookup,
  mapSchedulingBookingToRecord,
} from "@/lib/booking/scheduling-booking-lookup";

async function resolveActorUserId(
  companyId: string,
  userId: string | null | undefined,
  options: SupabaseBookingServicePortOptions,
): Promise<string | null> {
  if (userId?.trim()) return userId.trim();
  const fromGetter = options.getActorUserId?.();
  if (fromGetter?.trim()) return fromGetter.trim();
  if (options.resolveActorUserIdForCompany) {
    return options.resolveActorUserIdForCompany(companyId);
  }
  return null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveServiceId(
  services: Array<{ id: string; name: string }>,
  serviceRef: string,
): string | null {
  const normalized = serviceRef.trim();
  if (!normalized) return null;

  if (UUID_PATTERN.test(normalized)) {
    const byId = services.find((item) => item.id === normalized);
    if (byId) return byId.id;
  }

  const byName = services.find((item) => item.name.toLowerCase() === normalized.toLowerCase());
  return byName?.id ?? null;
}

function resolveLocalSlotFromInstant(startAt: string, timezone: string): { date: string; slotStart: string } {
  const instant = TimezoneResolver.parseInstant(startAt);
  return {
    date: TimezoneResolver.localDateForInstant(instant, timezone),
    slotStart: TimezoneResolver.localTimeForInstant(instant, timezone),
  };
}

function resolveDomainSlotInput(input: CreateBookingInput): {
  resourceId: string;
  serviceId: string;
  date: string;
  slotStart: string;
} | null {
  const schedulingSlot = input.schedulingSlot;
  if (schedulingSlot) {
    const { date, slotStart } = resolveLocalSlotFromInstant(
      schedulingSlot.startAt,
      schedulingSlot.timezone,
    );
    return {
      resourceId: schedulingSlot.resourceId,
      serviceId: schedulingSlot.serviceId,
      date,
      slotStart,
    };
  }

  const doctorId = input.doctorId?.trim();
  if (!doctorId || !UUID_PATTERN.test(doctorId)) return null;

  if (!input.appointmentTime.includes("T")) {
    return {
      resourceId: doctorId,
      serviceId: UUID_PATTERN.test(input.service.trim()) ? input.service.trim() : "",
      date: input.appointmentDate.trim(),
      slotStart: input.appointmentTime.slice(0, 5),
    };
  }

  // Instant appointment times without structured slot still map onto the domain path.
  if (input.appointmentTime.includes("T") && UUID_PATTERN.test(doctorId)) {
    const timezone = input.schedulingSlot?.timezone?.trim() || "UTC";
    const { date, slotStart } = resolveLocalSlotFromInstant(input.appointmentTime, timezone);
    return {
      resourceId: doctorId,
      serviceId: UUID_PATTERN.test(input.service.trim()) ? input.service.trim() : "",
      date,
      slotStart,
    };
  }

  return null;
}

function isSchedulingCapableInput(input: CreateBookingInput): boolean {
  if (input.schedulingSlot?.serviceId && input.schedulingSlot?.resourceId) return true;
  if (UUID_PATTERN.test(input.doctorId?.trim() ?? "") && UUID_PATTERN.test(input.customerId?.trim() ?? "")) {
    return true;
  }
  return false;
}

/**
 * Automation adapter: routes clinic/scheduling creates through BookingDomainService
 * using the injected Supabase client (service role on webhooks).
 * Legacy CRM `bookings` is only used for non-scheduling inputs.
 */
export function createSchedulingAwareBookingServicePort(
  client: SupabaseClient,
  options: SupabaseBookingServicePortOptions | (() => string | null) = {},
): BookingServicePort {
  const portOptions: SupabaseBookingServicePortOptions =
    typeof options === "function" ? { getActorUserId: options } : options;
  wxRecordDependencyConstruction("createSupabaseBookingServicePort");
  const legacyPort = createSupabaseBookingServicePort(client, portOptions);
  const domainServices = BookingFactory.create(client);
  const domain = domainServices.bookingDomain;
  wxRecordDependencyConstruction("SchedulingServiceCatalogRepository");
  const serviceCatalog = new SchedulingServiceCatalogRepository(client);

  return {
    ...legacyPort,
    async findBooking(input: FindBookingInput): Promise<FindBookingResult> {
      wxRecordServiceResolution("bookingService.findBooking");
      const companyId = input.companyId?.trim() ?? "";
      const lookupValue = input.lookupValue?.trim() ?? "";
      if (!companyId || !lookupValue) {
        return { status: "not_found", count: 0 };
      }

      try {
        const bookings = await findSchedulingBookingsForLookup({
          client,
          companyId,
          lookupBy: input.lookupBy,
          lookupValue,
          userId: input.userId,
        });
        if (bookings.length === 0) {
          if (input.lookupBy === "phone" || input.lookupBy === "customer_id") {
            return { status: "not_found", count: 0 };
          }
          return legacyPort.findBooking(input);
        }
        if (bookings.length === 1 && bookings[0]) {
          return { status: "found", count: 1, booking: bookings[0] };
        }
        return { status: "duplicate", count: bookings.length };
      } catch {
        return { status: "not_found", count: 0 };
      }
    },
    async cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult> {
      wxRecordServiceResolution("bookingService.cancelBooking");
      const companyId = input.companyId?.trim() ?? "";
      const bookingId = input.bookingId?.trim() ?? "";
      if (!companyId || !bookingId) {
        return legacyPort.cancelBooking(input);
      }

      const userId = await resolveActorUserId(companyId, input.userId, portOptions);

      try {
        const result = await domain.cancelBooking({
          companyId,
          bookingId,
          updatedBy: userId,
          reason: "customer_request",
          enforceCancellationPolicy: false,
        });
        return { booking: mapSchedulingBookingToRecord(result.booking, userId) };
      } catch (error) {
        if (error instanceof BookingDomainError) {
          try {
            return await legacyPort.cancelBooking(input);
          } catch {
            throw new Error(error.message);
          }
        }
        throw error instanceof Error ? error : new Error("Clinic scheduling booking cancel failed.");
      }
    },
    async rescheduleBooking(input: RescheduleBookingInput): Promise<RescheduleBookingResult> {
      wxRecordServiceResolution("bookingService.rescheduleBooking");
      const companyId = input.companyId?.trim() ?? "";
      const bookingId = input.bookingId?.trim() ?? "";
      const startAt = input.schedulingSlot?.startAt?.trim() ?? "";
      const timezone = input.schedulingSlot?.timezone?.trim() ?? "";
      if (!companyId || !bookingId || !startAt || !timezone) {
        throw new Error(
          "Reschedule booking requires company, booking, slot start, and timezone.",
        );
      }

      const userId = await resolveActorUserId(companyId, input.userId, portOptions);
      const { date, slotStart } = resolveLocalSlotFromInstant(startAt, timezone);
      try {
        const result = await domain.rescheduleBooking({
          companyId,
          bookingId,
          date,
          slotStart,
          updatedBy: userId,
        });
        return {
          booking: mapSchedulingBookingToRecord(result.booking, userId),
          previousBookingId: result.previousBooking.id,
          confirmationNumber: result.booking.confirmation_number ?? null,
        };
      } catch (error) {
        if (error instanceof BookingDomainError) {
          throw new Error(error.message);
        }
        throw error instanceof Error
          ? error
          : new Error("Clinic scheduling booking reschedule failed.");
      }
    },
    async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      wxRecordServiceResolution("bookingService.createBooking");
      const companyId = input.companyId?.trim();
      if (!companyId) {
        if (isSchedulingCapableInput(input)) {
          throw new Error("Create booking requires companyId for clinic scheduling bookings.");
        }
        return legacyPort.createBooking(input);
      }

      const userId = await resolveActorUserId(companyId, input.userId, portOptions);
      if (!userId) {
        if (isSchedulingCapableInput(input)) {
          throw new Error("Create booking requires an actor userId for clinic scheduling bookings.");
        }
        return legacyPort.createBooking(input);
      }

      const slotInput = resolveDomainSlotInput(input);
      if (!slotInput) {
        if (isSchedulingCapableInput(input)) {
          throw new Error(
            "Create booking could not resolve a scheduling slot (resource/service/date/time).",
          );
        }
        return legacyPort.createBooking(input);
      }

      let serviceId = slotInput.serviceId.trim();
      if (!serviceId || !UUID_PATTERN.test(serviceId)) {
        const services = await serviceCatalog.listByCompany(companyId);
        const matched = resolveServiceId(services, input.service?.trim() ?? "");
        if (!matched) {
          throw new Error(
            `Create booking could not resolve service "${input.service ?? ""}" in the scheduling catalog.`,
          );
        }
        serviceId = matched;
      }

      if (!UUID_PATTERN.test(input.customerId?.trim() ?? "")) {
        throw new Error("Create booking requires a valid customer UUID.");
      }
      if (!UUID_PATTERN.test(slotInput.resourceId)) {
        throw new Error("Create booking requires a valid resource/doctor UUID.");
      }

      const domainInput: DomainCreateInput = {
        companyId,
        customerId: input.customerId.trim(),
        resourceId: slotInput.resourceId,
        serviceId,
        date: slotInput.date,
        slotStart: slotInput.slotStart,
        source: "whatsapp",
        notes: input.notes ?? null,
        createdBy: userId,
      };

      try {
        const result = await domain.createBooking(domainInput);
        return {
          bookingId: result.booking.id,
          bookingDate: result.booking.start_at,
          confirmationNumber: result.booking.confirmation_number ?? null,
        };
      } catch (error) {
        if (error instanceof BookingDomainError) {
          throw new Error(error.message);
        }
        throw error instanceof Error
          ? error
          : new Error("Clinic scheduling booking creation failed.");
      }
    },
  };
}
