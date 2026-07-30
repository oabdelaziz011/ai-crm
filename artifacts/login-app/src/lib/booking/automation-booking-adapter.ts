import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingServicePort } from "@workspace/automation-platform";
import { createSupabaseBookingServicePort } from "@/lib/crm/supabase-booking-service-adapter";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import { getSchedulingServices } from "@/lib/scheduling";
import { BookingDomainError } from "@/lib/scheduling/booking-domain";
import type { CreateBookingInput as DomainCreateInput } from "@/lib/scheduling/booking-domain";
import type { CreateBookingInput, CreateBookingResult } from "@workspace/automation-platform";
import type { SupabaseBookingServicePortOptions } from "@workspace/automation-platform";

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

  const byId = services.find((item) => item.id === normalized);
  if (byId) return byId.id;

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
      serviceId: "",
      date: input.appointmentDate.trim(),
      slotStart: input.appointmentTime.slice(0, 5),
    };
  }

  return null;
}

/**
 * Automation adapter: routes scheduling-capable creates through BookingDomainService,
 * falls back to legacy CRM booking port otherwise.
 */
export function createSchedulingAwareBookingServicePort(
  client: SupabaseClient,
  options: SupabaseBookingServicePortOptions | (() => string | null) = {},
): BookingServicePort {
  const portOptions: SupabaseBookingServicePortOptions =
    typeof options === "function" ? { getActorUserId: options } : options;
  const legacyPort = createSupabaseBookingServicePort(client, portOptions);
  const domain = getBookingDomainServices().bookingDomain;
  const scheduling = getSchedulingServices();

  return {
    ...legacyPort,
    async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      const companyId = input.companyId?.trim();
      if (!companyId) {
        return legacyPort.createBooking(input);
      }

      const userId = await resolveActorUserId(input, portOptions);
      if (!userId) {
        return legacyPort.createBooking(input);
      }

      const slotInput = resolveDomainSlotInput(input);
      if (!slotInput) {
        return legacyPort.createBooking(input);
      }

      let serviceId = slotInput.serviceId;
      if (!serviceId) {
        const services = await scheduling.serviceCatalog.list(companyId);
        const matched = resolveServiceId(services, input.service?.trim() ?? "");
        if (!matched) {
          return legacyPort.createBooking(input);
        }
        serviceId = matched;
      }

      const domainInput: DomainCreateInput = {
        companyId,
        customerId: input.customerId,
        resourceId: slotInput.resourceId,
        serviceId,
        date: slotInput.date,
        slotStart: slotInput.slotStart,
        source: "api",
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
        return legacyPort.createBooking(input);
      }
    },
  };
}
