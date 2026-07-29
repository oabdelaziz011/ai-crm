import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BookingRulesUpsert,
  HolidayInsert,
  HolidayUpdate,
  SchedulingBookingRules,
  SchedulingHoliday,
} from "../types";

export class SchedulingBookingRulesRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getByCompany(companyId: string): Promise<SchedulingBookingRules | null> {
    const { data, error } = await this.client
      .from("scheduling_booking_rules")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as SchedulingBookingRules | null) ?? null;
  }

  async upsert(values: BookingRulesUpsert): Promise<SchedulingBookingRules> {
    const { data, error } = await this.client
      .from("scheduling_booking_rules")
      .upsert(values, { onConflict: "company_id" })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingBookingRules;
  }
}

export class SchedulingHolidayRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<SchedulingHoliday[]> {
    const { data, error } = await this.client
      .from("scheduling_holidays")
      .select("*, branches(id, name)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("holiday_date", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as SchedulingHoliday[];
  }

  async create(values: HolidayInsert): Promise<SchedulingHoliday> {
    const { data, error } = await this.client
      .from("scheduling_holidays")
      .insert(values)
      .select("*, branches(id, name)")
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingHoliday;
  }

  async update(
    id: string,
    companyId: string,
    values: HolidayUpdate,
  ): Promise<SchedulingHoliday> {
    const { data, error } = await this.client
      .from("scheduling_holidays")
      .update(values)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select("*, branches(id, name)")
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingHoliday;
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    const { error } = await this.client
      .from("scheduling_holidays")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
  }
}
