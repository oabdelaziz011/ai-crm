import type { SupabaseClient } from "@supabase/supabase-js";
import { createSchedulingServices } from "@/lib/scheduling";
import { supabase as defaultClient } from "@/lib/supabase";
import type { WeekdayIndex } from "@/lib/scheduling/types";
import { buildDatePickerConstraints } from "./build-date-picker-constraints";
import type { DatePickerConstraintsRequest, DatePickerConstraintsSnapshot } from "./types";

export class BusinessCalendarService {
  constructor(private readonly client: SupabaseClient) {}

  async getDatePickerConstraints(
    request: DatePickerConstraintsRequest,
  ): Promise<DatePickerConstraintsSnapshot> {
    const scheduling = createSchedulingServices(this.client);
    const [holidays, bookingRules, openWeekdays] = await Promise.all([
      scheduling.holidays.list(request.companyId),
      scheduling.bookingRules.get(request.companyId),
      this.listOpenWeekdays(request.companyId),
    ]);

    return buildDatePickerConstraints({
      holidays,
      bookingRules,
      openWeekdays,
      options: {
        disablePastDates: request.disablePastDates,
        disableCompanyHolidays: request.disableCompanyHolidays,
        holidayBehavior: request.holidayBehavior,
        disableClosedWeekdays: request.disableClosedWeekdays,
        branchId: request.branchId,
      },
      referenceNow: request.referenceNow,
      fromDate: request.fromDate,
      toDate: request.toDate,
    });
  }

  /** Weekdays where at least one active resource is open. */
  private async listOpenWeekdays(companyId: string): Promise<WeekdayIndex[]> {
    const { data: resources, error: resourceError } = await this.client
      .from("scheduling_resources")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (resourceError) throw new Error(resourceError.message);
    const resourceIds = (resources ?? []).map((row) => row.id as string);
    if (resourceIds.length === 0) return [];

    const { data: weeklyHours, error: hoursError } = await this.client
      .from("scheduling_resource_weekly_hours")
      .select("day_of_week, is_closed, opens_at, closes_at, resource_id")
      .eq("company_id", companyId)
      .in("resource_id", resourceIds);

    if (hoursError) throw new Error(hoursError.message);

    const open = new Set<WeekdayIndex>();
    for (const row of weeklyHours ?? []) {
      if (row.is_closed || !row.opens_at || !row.closes_at) continue;
      open.add(Number(row.day_of_week) as WeekdayIndex);
    }
    return [...open];
  }
}

let defaultService: BusinessCalendarService | null = null;

export function getBusinessCalendarService(client?: SupabaseClient): BusinessCalendarService {
  if (client) return new BusinessCalendarService(client);
  if (!defaultService) defaultService = new BusinessCalendarService(defaultClient);
  return defaultService;
}
