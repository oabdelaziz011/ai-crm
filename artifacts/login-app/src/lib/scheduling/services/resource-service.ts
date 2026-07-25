import type { SchedulingAvailabilityRepository } from "@/lib/scheduling/repositories/availability-repository";
import type { SchedulingResourceRepository } from "@/lib/scheduling/repositories/resource-repository";
import {
  resourceFormSchema,
  type ResourceFormValues,
} from "@/lib/scheduling/validation/schemas";
import {
  DEFAULT_WEEKLY_HOURS,
  type ResourceInsert,
  type ResourceUpdate,
  type SchedulingResource,
} from "@/lib/scheduling/types";

export class ResourceService {
  constructor(
    private readonly resourceRepository: SchedulingResourceRepository,
    private readonly availabilityRepository: SchedulingAvailabilityRepository,
  ) {}

  list(companyId: string): Promise<SchedulingResource[]> {
    return this.resourceRepository.listByCompany(companyId);
  }

  getById(id: string, companyId: string): Promise<SchedulingResource | null> {
    return this.resourceRepository.getById(id, companyId);
  }

  async create(
    companyId: string,
    userId: string,
    input: ResourceFormValues,
  ): Promise<SchedulingResource> {
    const parsed = resourceFormSchema.parse(input);
    const payload: ResourceInsert = {
      company_id: companyId,
      branch_id: parsed.branch_id ?? null,
      name: parsed.name,
      resource_type: parsed.resource_type,
      status: parsed.status,
      timezone: parsed.timezone,
      description: parsed.description ?? null,
      created_by: userId,
      updated_by: userId,
    };

    const resource = await this.resourceRepository.create(payload);

    await this.availabilityRepository.replaceWeeklySchedule(
      resource.id,
      companyId,
      DEFAULT_WEEKLY_HOURS,
    );

    return resource;
  }

  async update(
    id: string,
    companyId: string,
    userId: string,
    input: ResourceFormValues,
  ): Promise<SchedulingResource> {
    const parsed = resourceFormSchema.parse(input);
    const payload: ResourceUpdate = {
      branch_id: parsed.branch_id ?? null,
      name: parsed.name,
      resource_type: parsed.resource_type,
      status: parsed.status,
      timezone: parsed.timezone,
      description: parsed.description ?? null,
      updated_by: userId,
    };

    return this.resourceRepository.update(id, companyId, payload);
  }

  delete(id: string, companyId: string): Promise<void> {
    return this.resourceRepository.softDelete(id, companyId);
  }
}
