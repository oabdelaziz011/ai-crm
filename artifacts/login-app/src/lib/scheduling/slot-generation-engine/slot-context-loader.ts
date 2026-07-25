import type { SupabaseClient } from "@supabase/supabase-js";
import { AvailabilityEngine } from "@/lib/scheduling/availability-engine/availability-engine";
import { SchedulingBookingRepository } from "@/lib/scheduling/repositories/scheduling-booking-repository";
import { SchedulingBookingRulesRepository } from "@/lib/scheduling/repositories/rules-repository";
import { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import { DEFAULT_BOOKING_RULES } from "@/lib/scheduling/types";
import type { SlotGenerationOptions, SlotGenerationSnapshot } from "@/lib/scheduling/slot-generation-engine/types";

export class SlotContextLoader {
  private readonly availabilityEngine: AvailabilityEngine;
  private readonly serviceRepo: SchedulingServiceCatalogRepository;
  private readonly rulesRepo: SchedulingBookingRulesRepository;
  private readonly bookingRepo: SchedulingBookingRepository;

  constructor(client: SupabaseClient) {
    this.availabilityEngine = new AvailabilityEngine(client);
    this.serviceRepo = new SchedulingServiceCatalogRepository(client);
    this.rulesRepo = new SchedulingBookingRulesRepository(client);
    this.bookingRepo = new SchedulingBookingRepository(client);
  }

  async load(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    options: SlotGenerationOptions = {},
  ): Promise<SlotGenerationSnapshot> {
    const respectBookingRules = options.respectBookingRules ?? true;
    const referenceNow = options.referenceNow ?? new Date();

    const [availability, service, bookingRules] = await Promise.all([
      this.availabilityEngine.resolveAvailability(companyId, resourceId, serviceId, date, {
        respectBookingRules,
        referenceNow,
      }),
      this.serviceRepo.getById(serviceId, companyId),
      this.rulesRepo.getByCompany(companyId),
    ]);

    const rules = bookingRules ?? {
      id: "",
      company_id: companyId,
      ...DEFAULT_BOOKING_RULES,
      created_at: "",
      updated_at: "",
      created_by: null,
      updated_by: null,
    };

    const existingBookings = await this.bookingRepo.listByResourceAndDate(
      companyId,
      resourceId,
      date,
      availability.timezone,
    );

    return {
      resourceId,
      serviceId,
      date,
      timezone: availability.timezone,
      durationMinutes: service?.duration_minutes ?? 0,
      periods: availability.periods,
      availabilityReasons: availability.reasons,
      availabilityAvailable: availability.available,
      bookingRules: {
        durationMinutes: service?.duration_minutes ?? 0,
        slotIntervalMinutes: rules.slot_interval_minutes,
        bufferBeforeMinutes: rules.buffer_before_minutes,
        bufferAfterMinutes: rules.buffer_after_minutes,
        allowOverbooking: rules.allow_overbooking,
        minBookingNoticeMinutes: rules.min_booking_notice_minutes,
        maxBookingWindowDays: rules.max_booking_window_days,
      },
      existingBookings,
      options: {
        ...options,
        respectBookingRules,
        referenceNow,
        timezone: availability.timezone,
        date,
        minBookingNoticeMinutes: rules.min_booking_notice_minutes,
      },
    };
  }

  /** Batch load snapshots for multiple resources (parallel availability + single booking query). */
  async loadBatch(
    companyId: string,
    resourceIds: string[],
    serviceId: string,
    date: string,
    options: SlotGenerationOptions = {},
  ): Promise<SlotGenerationSnapshot[]> {
    if (resourceIds.length === 0) {
      return [];
    }

    const respectBookingRules = options.respectBookingRules ?? true;
    const referenceNow = options.referenceNow ?? new Date();

    const [service, bookingRules, ...availabilities] = await Promise.all([
      this.serviceRepo.getById(serviceId, companyId),
      this.rulesRepo.getByCompany(companyId),
      ...resourceIds.map((resourceId) =>
        this.availabilityEngine.resolveAvailability(companyId, resourceId, serviceId, date, {
          respectBookingRules,
          referenceNow,
        }),
      ),
    ]);

    const rules = bookingRules ?? {
      id: "",
      company_id: companyId,
      ...DEFAULT_BOOKING_RULES,
      created_at: "",
      updated_at: "",
      created_by: null,
      updated_by: null,
    };

    const timezone = availabilities[0]?.timezone ?? rules.timezone;
    const bookingsByResource = await this.bookingRepo.listByResourcesAndDate(
      companyId,
      resourceIds,
      date,
      timezone,
    );

    return resourceIds.map((resourceId, index) => {
      const availability = availabilities[index];
      return {
        resourceId,
        serviceId,
        date,
        timezone: availability.timezone,
        durationMinutes: service?.duration_minutes ?? 0,
        periods: availability.periods,
        availabilityReasons: availability.reasons,
        availabilityAvailable: availability.available,
        bookingRules: {
          durationMinutes: service?.duration_minutes ?? 0,
          slotIntervalMinutes: rules.slot_interval_minutes,
          bufferBeforeMinutes: rules.buffer_before_minutes,
          bufferAfterMinutes: rules.buffer_after_minutes,
          allowOverbooking: rules.allow_overbooking,
          minBookingNoticeMinutes: rules.min_booking_notice_minutes,
          maxBookingWindowDays: rules.max_booking_window_days,
        },
        existingBookings: bookingsByResource.get(resourceId) ?? [],
        options: {
          ...options,
          respectBookingRules,
          referenceNow,
          timezone: availability.timezone,
          date,
          minBookingNoticeMinutes: rules.min_booking_notice_minutes,
        },
      };
    });
  }
}
