import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingServicePort } from "@workspace/automation-platform";
import { createSupabaseBookingServicePort } from "@/lib/crm/supabase-booking-service-adapter";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import { getSchedulingServices } from "@/lib/scheduling";
import { BookingDomainError } from "@/lib/scheduling/booking-domain";
import type { CreateBookingInput as DomainCreateInput } from "@/lib/scheduling/booking-domain";
import type { CreateBookingInput, CreateBookingResult } from "@workspace/automation-platform";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Automation adapter: routes scheduling-capable creates through BookingDomainService,
 * falls back to legacy CRM booking port otherwise.
 */
export function createSchedulingAwareBookingServicePort(
  client: SupabaseClient,
  getActorUserId: () => string | null,
): BookingServicePort {
  const legacyPort = createSupabaseBookingServicePort(client, getActorUserId);
  const domain = getBookingDomainServices().bookingDomain;
  const scheduling = getSchedulingServices();

  return {
    ...legacyPort,
    async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      const companyId = input.companyId?.trim();
      const doctorId = input.doctorId?.trim();
      const serviceName = input.service?.trim();

      if (!companyId || !UUID_PATTERN.test(doctorId)) {
        return legacyPort.createBooking(input);
      }

      const userId = input.userId?.trim() || getActorUserId();
      if (!userId) {
        return legacyPort.createBooking(input);
      }

      const services = await scheduling.serviceCatalog.list(companyId);
      const matchedService = services.find(
        (item) => item.name.toLowerCase() === serviceName.toLowerCase(),
      );

      if (!matchedService) {
        return legacyPort.createBooking(input);
      }

      const date = input.appointmentDate.trim();
      const slotStart = input.appointmentTime.includes("T")
        ? input.appointmentTime.split("T")[1]?.slice(0, 5) ?? input.appointmentTime.slice(0, 5)
        : input.appointmentTime.slice(0, 5);

      const domainInput: DomainCreateInput = {
        companyId,
        customerId: input.customerId,
        resourceId: doctorId,
        serviceId: matchedService.id,
        date,
        slotStart,
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
