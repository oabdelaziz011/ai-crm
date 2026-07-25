import type { SchedulingBookingRulesRepository } from "@/lib/scheduling/repositories/rules-repository";
import {
  bookingRulesFormSchema,
  type BookingRulesFormValues,
} from "@/lib/scheduling/validation/schemas";
import {
  DEFAULT_BOOKING_RULES,
  type BookingRulesUpsert,
  type SchedulingBookingRules,
} from "@/lib/scheduling/types";

export class BookingRulesService {
  constructor(private readonly repository: SchedulingBookingRulesRepository) {}

  get(companyId: string): Promise<SchedulingBookingRules | null> {
    return this.repository.getByCompany(companyId);
  }

  async getOrDefaults(companyId: string): Promise<BookingRulesFormValues> {
    const existing = await this.repository.getByCompany(companyId);
    if (!existing) {
      return { ...DEFAULT_BOOKING_RULES };
    }
    return {
      min_booking_notice_minutes: existing.min_booking_notice_minutes,
      max_booking_window_days: existing.max_booking_window_days,
      buffer_before_minutes: existing.buffer_before_minutes,
      buffer_after_minutes: existing.buffer_after_minutes,
      slot_interval_minutes: existing.slot_interval_minutes ?? DEFAULT_BOOKING_RULES.slot_interval_minutes,
      min_cancellation_notice_minutes:
        existing.min_cancellation_notice_minutes ??
        DEFAULT_BOOKING_RULES.min_cancellation_notice_minutes,
      min_reschedule_notice_minutes:
        existing.min_reschedule_notice_minutes ??
        DEFAULT_BOOKING_RULES.min_reschedule_notice_minutes,
      allow_overbooking: existing.allow_overbooking,
      timezone: existing.timezone,
      week_start_day: existing.week_start_day,
    };
  }

  async save(
    companyId: string,
    userId: string,
    input: BookingRulesFormValues,
  ): Promise<SchedulingBookingRules> {
    const parsed = bookingRulesFormSchema.parse(input);
    const payload: BookingRulesUpsert = {
      company_id: companyId,
      ...parsed,
      created_by: userId,
      updated_by: userId,
    };
    return this.repository.upsert(payload);
  }
}
