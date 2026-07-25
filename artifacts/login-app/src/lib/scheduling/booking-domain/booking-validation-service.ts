import type { SupabaseClient } from "@supabase/supabase-js";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { DEFAULT_BOOKING_RULES } from "@/lib/scheduling/types";
import { SchedulingResourceRepository } from "@/lib/scheduling/repositories/resource-repository";
import { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import { ResourceServiceMappingRepository } from "@/lib/scheduling/repositories/resource-service-mapping-repository";
import { SchedulingBookingRulesRepository } from "@/lib/scheduling/repositories/rules-repository";
import type { SlotGenerationEngine } from "@/lib/scheduling/slot-generation-engine/slot-generation-engine";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";
import {
  addMinutesToInstantIso,
  localDateTimeToInstantIso,
} from "@/lib/scheduling/booking-domain/booking-time-utils";
import {
  evaluateCancellationPolicy,
  evaluateReschedulePolicy,
} from "@/lib/scheduling/booking-domain/booking-policy";
import type {
  BookingValidationErrorCode,
  BookingValidationResult,
  CreateBookingInput,
  RescheduleBookingInput,
  SchedulingBooking,
} from "@/lib/scheduling/booking-domain/types";

export type ValidateBookingParams = {
  companyId: string;
  customerId: string;
  resourceId: string;
  serviceId: string;
  date: string;
  slotStart: string;
  referenceNow?: Date;
  excludeBookingId?: string;
};

export class BookingValidationService {
  private readonly resourceRepo: SchedulingResourceRepository;
  private readonly serviceRepo: SchedulingServiceCatalogRepository;
  private readonly mappingRepo: ResourceServiceMappingRepository;
  private readonly rulesRepo: SchedulingBookingRulesRepository;
  private readonly bookingRepo: BookingRepository;

  constructor(
    client: SupabaseClient,
    private readonly slotEngine: SlotGenerationEngine,
  ) {
    this.resourceRepo = new SchedulingResourceRepository(client);
    this.serviceRepo = new SchedulingServiceCatalogRepository(client);
    this.mappingRepo = new ResourceServiceMappingRepository(client);
    this.rulesRepo = new SchedulingBookingRulesRepository(client);
    this.bookingRepo = new BookingRepository(client);
  }

  async validateBooking(params: ValidateBookingParams): Promise<BookingValidationResult> {
    const errors: BookingValidationErrorCode[] = [];
    const referenceNow = params.referenceNow ?? new Date();

    if (!TimezoneResolver.isValidDateString(params.date)) {
      return { valid: false, errors: ["invalid_date"] };
    }

    if (!/^\d{2}:\d{2}$/.test(params.slotStart)) {
      return { valid: false, errors: ["invalid_slot_time"] };
    }

    const [resource, service, capabilities, bookingRules] = await Promise.all([
      this.resourceRepo.getById(params.resourceId, params.companyId),
      this.serviceRepo.getById(params.serviceId, params.companyId),
      this.mappingRepo.listByResource(params.resourceId, params.companyId),
      this.rulesRepo.getByCompany(params.companyId),
    ]);

    if (!resource) {
      errors.push("resource_not_found");
    } else if (resource.status !== "active") {
      errors.push("resource_inactive");
    }

    if (!service) {
      errors.push("service_not_found");
    } else if (service.status !== "active") {
      errors.push("service_inactive");
    }

    if (service && !capabilities.some((item) => item.id === service.id)) {
      errors.push("capability_missing");
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const rules = bookingRules ?? {
      id: "",
      company_id: params.companyId,
      ...DEFAULT_BOOKING_RULES,
      created_at: "",
      updated_at: "",
      created_by: null,
      updated_by: null,
    };

    const timezone = TimezoneResolver.resolveEffectiveTimezone(
      resource!.timezone,
      null,
      rules.timezone,
    );

    const durationMinutes = service!.duration_minutes;
    const startAt = localDateTimeToInstantIso(params.date, params.slotStart, timezone);
    const endAt = addMinutesToInstantIso(startAt, durationMinutes);

    const slots = await this.slotEngine.getAvailableSlots(
      params.companyId,
      params.resourceId,
      params.serviceId,
      params.date,
      {
        respectBookingRules: true,
        referenceNow,
      },
    );

    if (!slots.available) {
      if (slots.reasons.includes("outside_booking_window")) {
        errors.push("outside_booking_window");
      } else if (slots.reasons.includes("inside_minimum_notice")) {
        errors.push("inside_minimum_notice");
      } else {
        errors.push("slot_unavailable");
      }
    } else if (!slots.slots.includes(params.slotStart)) {
      errors.push("slot_unavailable");
    }

    const conflict = await this.bookingRepo.findOverlapping(
      params.companyId,
      params.resourceId,
      startAt,
      endAt,
      params.excludeBookingId,
    );
    if (conflict) {
      errors.push("booking_conflict");
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      context: {
        timezone,
        durationMinutes,
        startAt,
        endAt,
        branchId: resource!.branch_id,
      },
    };
  }

  validateCreateInput(input: CreateBookingInput): BookingValidationResult | null {
    if (!input.companyId || !input.customerId || !input.resourceId || !input.serviceId) {
      return {
        valid: false,
        errors: ["company_mismatch"],
      };
    }
    return null;
  }

  validateRescheduleInput(input: RescheduleBookingInput): BookingValidationResult | null {
    if (!input.companyId || !input.bookingId || !input.date || !input.slotStart) {
      return { valid: false, errors: ["invalid_date"] };
    }
    return null;
  }

  async validateCancellation(params: {
    companyId: string;
    booking: SchedulingBooking;
    referenceNow?: Date;
  }): Promise<BookingValidationResult> {
    const referenceNow = params.referenceNow ?? new Date();
    const minNoticeMinutes = await this.resolveMinCancellationNoticeMinutes(params.companyId);
    const error = evaluateCancellationPolicy(
      params.booking.start_at,
      minNoticeMinutes,
      referenceNow,
    );
    if (error) {
      return { valid: false, errors: [error] };
    }
    return { valid: true, errors: [] };
  }

  async validateReschedulePolicy(params: {
    companyId: string;
    booking: SchedulingBooking;
    referenceNow?: Date;
  }): Promise<BookingValidationResult> {
    const referenceNow = params.referenceNow ?? new Date();
    const minNoticeMinutes = await this.resolveMinRescheduleNoticeMinutes(params.companyId);
    const error = evaluateReschedulePolicy(
      params.booking.start_at,
      minNoticeMinutes,
      referenceNow,
    );
    if (error) {
      return { valid: false, errors: [error] };
    }
    return { valid: true, errors: [] };
  }

  private async resolveMinCancellationNoticeMinutes(companyId: string): Promise<number> {
    const bookingRules = await this.rulesRepo.getByCompany(companyId);
    return (
      bookingRules?.min_cancellation_notice_minutes ??
      DEFAULT_BOOKING_RULES.min_cancellation_notice_minutes
    );
  }

  private async resolveMinRescheduleNoticeMinutes(companyId: string): Promise<number> {
    const bookingRules = await this.rulesRepo.getByCompany(companyId);
    return (
      bookingRules?.min_reschedule_notice_minutes ??
      DEFAULT_BOOKING_RULES.min_reschedule_notice_minutes
    );
  }
}
