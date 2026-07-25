import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailabilityContextSnapshot } from "@/lib/scheduling/availability-engine/availability-context";
import type { AvailabilityResolveOptions } from "@/lib/scheduling/availability-engine/types";
import { SchedulingAvailabilityRepository } from "@/lib/scheduling/repositories/availability-repository";
import { SchedulingResourceRepository } from "@/lib/scheduling/repositories/resource-repository";
import { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import { ResourceServiceMappingRepository } from "@/lib/scheduling/repositories/resource-service-mapping-repository";
import {
  SchedulingBookingRulesRepository,
  SchedulingHolidayRepository,
} from "@/lib/scheduling/repositories/rules-repository";
import { SchedulingBranchRepository } from "@/lib/scheduling/repositories/resource-repository";

export class AvailabilityContextLoader {
  private readonly resourceRepo: SchedulingResourceRepository;
  private readonly serviceRepo: SchedulingServiceCatalogRepository;
  private readonly availabilityRepo: SchedulingAvailabilityRepository;
  private readonly mappingRepo: ResourceServiceMappingRepository;
  private readonly rulesRepo: SchedulingBookingRulesRepository;
  private readonly holidayRepo: SchedulingHolidayRepository;
  private readonly branchRepo: SchedulingBranchRepository;

  constructor(client: SupabaseClient) {
    this.resourceRepo = new SchedulingResourceRepository(client);
    this.serviceRepo = new SchedulingServiceCatalogRepository(client);
    this.availabilityRepo = new SchedulingAvailabilityRepository(client);
    this.mappingRepo = new ResourceServiceMappingRepository(client);
    this.rulesRepo = new SchedulingBookingRulesRepository(client);
    this.holidayRepo = new SchedulingHolidayRepository(client);
    this.branchRepo = new SchedulingBranchRepository(client);
  }

  async load(
    companyId: string,
    resourceId: string,
    date: string,
    serviceId: string | null,
    options: AvailabilityResolveOptions = {},
  ): Promise<AvailabilityContextSnapshot> {
    const [resource, availabilityConfig, bookingRules, holidays] = await Promise.all([
      this.resourceRepo.getById(resourceId, companyId),
      this.availabilityRepo.getConfig(resourceId, companyId),
      this.rulesRepo.getByCompany(companyId),
      this.holidayRepo.listByCompany(companyId),
    ]);

    const branch = resource?.branch_id
      ? (await this.branchRepo.listByCompany(companyId)).find((b) => b.id === resource.branch_id) ??
        null
      : null;

    const service = serviceId
      ? await this.serviceRepo.getById(serviceId, companyId)
      : null;

    const capabilities = await this.mappingRepo.listByResource(resourceId, companyId);

    return {
      resourceId,
      resource,
      service,
      branch,
      weeklyHours: availabilityConfig.weeklyHours,
      breaks: availabilityConfig.breaks,
      exceptions: availabilityConfig.exceptions,
      holidays,
      bookingRules,
      serviceCapabilityIds: capabilities.map((item) => item.id),
      date,
      serviceId,
      options,
    };
  }
}

