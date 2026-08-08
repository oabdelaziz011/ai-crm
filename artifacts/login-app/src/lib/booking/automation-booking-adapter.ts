import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingServicePort } from "@workspace/automation-platform";
import { createSupabaseBookingServicePort } from "@/lib/crm/supabase-booking-service-adapter";
import { BookingFactory } from "@/lib/scheduling/booking-domain";
import { BookingDomainError } from "@/lib/scheduling/booking-domain";
import type { CreateBookingInput as DomainCreateInput } from "@/lib/scheduling/booking-domain";
import { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import type { CreateBookingInput, CreateBookingResult } from "@workspace/automation-platform";
import type { SupabaseBookingServicePortOptions } from "@workspace/automation-platform";
import { wxRecordDependencyConstruction, wxRecordServiceResolution } from "@workspace/automation-platform";

import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";

async function resolveActorUserId(
  input: CreateBookingInput,
  options: SupabaseBookingServicePortOptions,
): Promise<string | null> {
  if (input.userId?.trim()) return input.userId.trim();
  const fromGetter = options.getActorUserId?.();
  if (fromGetter?.trim()) return fromGetter.trim();
  if (options.resolveActorUserIdForCompany) {
    return options.resolveActorUserIdForCompany(input.companyId);
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
    const timezone = "UTC";
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
  // CRITICAL: use the injected client — never the browser singleton (RLS would block lookups).
  const domain = BookingFactory.create(client).bookingDomain;
  wxRecordDependencyConstruction("SchedulingServiceCatalogRepository");
  const serviceCatalog = new SchedulingServiceCatalogRepository(client);

  return {
    ...legacyPort,
    async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      wxRecordServiceResolution("bookingService.createBooking");
      const companyId = input.companyId?.trim();
      if (!companyId) {
        if (isSchedulingCapableInput(input)) {
          throw new Error("Create booking requires companyId for clinic scheduling bookings.");
        }
        return legacyPort.createBooking(input);
      }

      const userId = await resolveActorUserId(input, portOptions);
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
