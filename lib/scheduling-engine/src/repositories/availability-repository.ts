import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AvailabilityException,
  ExceptionInsert,
  ExceptionUpdate,
  ResourceAvailabilityConfig,
  ResourceBreak,
  ResourceWeeklyHours,
  WeeklyHoursUpsert,
} from "../types";

export class SchedulingAvailabilityRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getConfig(resourceId: string, companyId: string): Promise<ResourceAvailabilityConfig> {
    const [weeklyResult, breaksResult, exceptionsResult] = await Promise.all([
      this.client
        .from("scheduling_resource_weekly_hours")
        .select("*")
        .eq("resource_id", resourceId)
        .eq("company_id", companyId)
        .order("day_of_week"),
      this.client
        .from("scheduling_resource_breaks")
        .select("*")
        .eq("resource_id", resourceId)
        .eq("company_id", companyId),
      this.client
        .from("scheduling_availability_exceptions")
        .select("*")
        .eq("resource_id", resourceId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("starts_at", { ascending: false }),
    ]);

    if (weeklyResult.error) throw new Error(weeklyResult.error.message);
    if (breaksResult.error) throw new Error(breaksResult.error.message);
    if (exceptionsResult.error) throw new Error(exceptionsResult.error.message);

    return {
      resourceId,
      weeklyHours: (weeklyResult.data ?? []) as ResourceWeeklyHours[],
      breaks: (breaksResult.data ?? []) as ResourceBreak[],
      exceptions: (exceptionsResult.data ?? []) as AvailabilityException[],
    };
  }

  async replaceWeeklySchedule(
    resourceId: string,
    companyId: string,
    days: WeeklyHoursUpsert[],
  ): Promise<ResourceAvailabilityConfig> {
    const { error: deleteBreaksError } = await this.client
      .from("scheduling_resource_breaks")
      .delete()
      .eq("resource_id", resourceId)
      .eq("company_id", companyId);

    if (deleteBreaksError) throw new Error(deleteBreaksError.message);

    const { error: deleteHoursError } = await this.client
      .from("scheduling_resource_weekly_hours")
      .delete()
      .eq("resource_id", resourceId)
      .eq("company_id", companyId);

    if (deleteHoursError) throw new Error(deleteHoursError.message);

    for (const day of days) {
      const { data: hoursRow, error: hoursError } = await this.client
        .from("scheduling_resource_weekly_hours")
        .insert({
          company_id: companyId,
          resource_id: resourceId,
          day_of_week: day.day_of_week,
          is_closed: day.is_closed,
          opens_at: day.is_closed ? null : day.opens_at,
          closes_at: day.is_closed ? null : day.closes_at,
        })
        .select()
        .single();

      if (hoursError) throw new Error(hoursError.message);

      if (!day.is_closed && day.breaks?.length) {
        const breakRows = day.breaks.map((item) => ({
          company_id: companyId,
          resource_id: resourceId,
          weekly_hours_id: hoursRow.id,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          label: item.label ?? null,
        }));

        const { error: breakError } = await this.client
          .from("scheduling_resource_breaks")
          .insert(breakRows);

        if (breakError) throw new Error(breakError.message);
      }
    }

    return this.getConfig(resourceId, companyId);
  }

  async createException(values: ExceptionInsert): Promise<AvailabilityException> {
    const { data, error } = await this.client
      .from("scheduling_availability_exceptions")
      .insert(values)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as AvailabilityException;
  }

  async updateException(
    id: string,
    companyId: string,
    values: ExceptionUpdate,
  ): Promise<AvailabilityException> {
    const { data, error } = await this.client
      .from("scheduling_availability_exceptions")
      .update(values)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as AvailabilityException;
  }

  async softDeleteException(id: string, companyId: string): Promise<void> {
    const { error } = await this.client
      .from("scheduling_availability_exceptions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
  }
}
