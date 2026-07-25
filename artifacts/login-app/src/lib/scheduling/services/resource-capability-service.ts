import type { ResourceServiceMappingRepository } from "@/lib/scheduling/repositories/resource-service-mapping-repository";
import type { SchedulingResourceRepository } from "@/lib/scheduling/repositories/resource-repository";
import type { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import { capabilitySelectionSchema } from "@/lib/scheduling/validation/service-schemas";
import type {
  EligibleResourceRef,
  ResourceCapabilityRef,
} from "@/lib/scheduling/types";

export class ResourceCapabilityService {
  constructor(
    private readonly mappingRepository: ResourceServiceMappingRepository,
    private readonly resourceRepository: SchedulingResourceRepository,
    private readonly serviceRepository: SchedulingServiceCatalogRepository,
  ) {}

  listServicesForResource(
    resourceId: string,
    companyId: string,
  ): Promise<ResourceCapabilityRef[]> {
    return this.mappingRepository.listByResource(resourceId, companyId);
  }

  listResourcesForService(
    serviceId: string,
    companyId: string,
    options?: { branchId?: string | null },
  ): Promise<EligibleResourceRef[]> {
    return this.mappingRepository.listByService(serviceId, companyId, options);
  }

  /**
   * Replace all service capabilities for a resource (resource profile → Services tab).
   */
  async syncResourceServices(
    resourceId: string,
    companyId: string,
    userId: string,
    serviceIds: string[],
  ): Promise<ResourceCapabilityRef[]> {
    const parsed = capabilitySelectionSchema.parse({ ids: serviceIds });
    await this.assertResource(resourceId, companyId);

    const uniqueServiceIds = [...new Set(parsed.ids)];
    for (const serviceId of uniqueServiceIds) {
      await this.assertService(serviceId, companyId);
    }

    const current = await this.mappingRepository.listActiveMappingsForResource(
      resourceId,
      companyId,
    );
    const targetSet = new Set(uniqueServiceIds);
    const currentByService = new Map(current.map((row) => [row.service_id, row]));

    for (const mapping of current) {
      if (!targetSet.has(mapping.service_id)) {
        await this.mappingRepository.softDeleteMapping(mapping.id, companyId);
      }
    }

    for (const serviceId of uniqueServiceIds) {
      const existing = currentByService.get(serviceId);
      if (existing) continue;

      const deleted = await this.mappingRepository.findMappingIncludingDeleted(
        resourceId,
        serviceId,
        companyId,
      );

      if (deleted && deleted.deleted_at) {
        await this.mappingRepository.restoreMapping(deleted.id, companyId, userId);
      } else if (!deleted) {
        await this.mappingRepository.insertMapping({
          company_id: companyId,
          resource_id: resourceId,
          service_id: serviceId,
          created_by: userId,
        });
      }
    }

    return this.mappingRepository.listByResource(resourceId, companyId);
  }

  /**
   * Replace all resource capabilities for a service (service profile → Resources section).
   */
  async syncServiceResources(
    serviceId: string,
    companyId: string,
    userId: string,
    resourceIds: string[],
  ): Promise<EligibleResourceRef[]> {
    const parsed = capabilitySelectionSchema.parse({ ids: resourceIds });
    await this.assertService(serviceId, companyId);

    const uniqueResourceIds = [...new Set(parsed.ids)];
    for (const resourceId of uniqueResourceIds) {
      await this.assertResource(resourceId, companyId);
    }

    const current = await this.mappingRepository.listActiveMappingsForService(
      serviceId,
      companyId,
    );
    const targetSet = new Set(uniqueResourceIds);
    const currentByResource = new Map(current.map((row) => [row.resource_id, row]));

    for (const mapping of current) {
      if (!targetSet.has(mapping.resource_id)) {
        await this.mappingRepository.softDeleteMapping(mapping.id, companyId);
      }
    }

    for (const resourceId of uniqueResourceIds) {
      const existing = currentByResource.get(resourceId);
      if (existing) continue;

      const deleted = await this.mappingRepository.findMappingIncludingDeleted(
        resourceId,
        serviceId,
        companyId,
      );

      if (deleted && deleted.deleted_at) {
        await this.mappingRepository.restoreMapping(deleted.id, companyId, userId);
      } else if (!deleted) {
        await this.mappingRepository.insertMapping({
          company_id: companyId,
          resource_id: resourceId,
          service_id: serviceId,
          created_by: userId,
        });
      }
    }

    return this.mappingRepository.listByService(serviceId, companyId);
  }

  private async assertResource(resourceId: string, companyId: string): Promise<void> {
    const resource = await this.resourceRepository.getById(resourceId, companyId);
    if (!resource) {
      throw new Error("SCHEDULING_RESOURCE_NOT_FOUND");
    }
  }

  private async assertService(serviceId: string, companyId: string): Promise<void> {
    const service = await this.serviceRepository.getById(serviceId, companyId);
    if (!service) {
      throw new Error("SCHEDULING_SERVICE_NOT_FOUND");
    }
  }
}
