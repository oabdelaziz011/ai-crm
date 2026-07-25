import type { SchedulingHolidayRepository } from "@/lib/scheduling/repositories/rules-repository";
import {
  holidayFormSchema,
  type HolidayFormValues,
} from "@/lib/scheduling/validation/schemas";
import type { HolidayInsert, SchedulingHoliday } from "@/lib/scheduling/types";

export class HolidayService {
  constructor(private readonly repository: SchedulingHolidayRepository) {}

  list(companyId: string): Promise<SchedulingHoliday[]> {
    return this.repository.listByCompany(companyId);
  }

  async create(
    companyId: string,
    userId: string,
    input: HolidayFormValues,
  ): Promise<SchedulingHoliday> {
    const parsed = holidayFormSchema.parse(input);
    const payload: HolidayInsert = {
      company_id: companyId,
      branch_id: parsed.branch_id ?? null,
      holiday_date: parsed.holiday_date,
      title: parsed.title,
      created_by: userId,
      updated_by: userId,
    };
    return this.repository.create(payload);
  }

  async update(
    id: string,
    companyId: string,
    userId: string,
    input: HolidayFormValues,
  ): Promise<SchedulingHoliday> {
    const parsed = holidayFormSchema.parse(input);
    return this.repository.update(id, companyId, {
      branch_id: parsed.branch_id ?? null,
      holiday_date: parsed.holiday_date,
      title: parsed.title,
      updated_by: userId,
    });
  }

  delete(id: string, companyId: string): Promise<void> {
    return this.repository.softDelete(id, companyId);
  }
}
