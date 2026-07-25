import type { SchedulingAvailabilityRepository } from "@/lib/scheduling/repositories/availability-repository";
import type { SchedulingResourceRepository } from "@/lib/scheduling/repositories/resource-repository";
import {
  exceptionFormSchema,
  weeklyScheduleSchema,
  type ExceptionFormValues,
  type WeeklyScheduleFormValues,
} from "@/lib/scheduling/validation/schemas";
import type {
  AvailabilityException,
  ExceptionInsert,
  ResourceAvailabilityConfig,
} from "@/lib/scheduling/types";

export class AvailabilityService {
  constructor(
    private readonly availabilityRepository: SchedulingAvailabilityRepository,
    private readonly resourceRepository: SchedulingResourceRepository,
  ) {}

  async getConfig(
    resourceId: string,
    companyId: string,
  ): Promise<ResourceAvailabilityConfig> {
    await this.assertResource(resourceId, companyId);
    return this.availabilityRepository.getConfig(resourceId, companyId);
  }

  async saveWeeklySchedule(
    resourceId: string,
    companyId: string,
    input: WeeklyScheduleFormValues,
  ): Promise<ResourceAvailabilityConfig> {
    await this.assertResource(resourceId, companyId);
    const parsed = weeklyScheduleSchema.parse(input);
    return this.availabilityRepository.replaceWeeklySchedule(
      resourceId,
      companyId,
      parsed.days,
    );
  }

  async createException(
    resourceId: string,
    companyId: string,
    userId: string,
    input: ExceptionFormValues,
  ): Promise<AvailabilityException> {
    await this.assertResource(resourceId, companyId);
    const parsed = exceptionFormSchema.parse(input);
    const payload: ExceptionInsert = {
      company_id: companyId,
      resource_id: resourceId,
      exception_type: parsed.exception_type,
      title: parsed.title,
      starts_at: parsed.starts_at,
      ends_at: parsed.ends_at,
      all_day: parsed.all_day,
      notes: parsed.notes ?? null,
      created_by: userId,
      updated_by: userId,
    };
    return this.availabilityRepository.createException(payload);
  }

  async updateException(
    id: string,
    resourceId: string,
    companyId: string,
    userId: string,
    input: ExceptionFormValues,
  ): Promise<AvailabilityException> {
    await this.assertResource(resourceId, companyId);
    const parsed = exceptionFormSchema.parse(input);
    return this.availabilityRepository.updateException(id, companyId, {
      exception_type: parsed.exception_type,
      title: parsed.title,
      starts_at: parsed.starts_at,
      ends_at: parsed.ends_at,
      all_day: parsed.all_day,
      notes: parsed.notes ?? null,
      updated_by: userId,
    });
  }

  deleteException(id: string, companyId: string): Promise<void> {
    return this.availabilityRepository.softDeleteException(id, companyId);
  }

  private async assertResource(resourceId: string, companyId: string): Promise<void> {
    const resource = await this.resourceRepository.getById(resourceId, companyId);
    if (!resource) {
      throw new Error("SCHEDULING_RESOURCE_NOT_FOUND");
    }
  }
}
