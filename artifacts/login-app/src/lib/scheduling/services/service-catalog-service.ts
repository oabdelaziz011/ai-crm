import type { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import {
  serviceFormSchema,
  type ServiceFormValues,
} from "@/lib/scheduling/validation/service-schemas";
import type { SchedulingService, ServiceInsert, ServiceUpdate } from "@/lib/scheduling/types";

export class ServiceCatalogService {
  constructor(private readonly repository: SchedulingServiceCatalogRepository) {}

  list(companyId: string): Promise<SchedulingService[]> {
    return this.repository.listByCompany(companyId);
  }

  getById(id: string, companyId: string): Promise<SchedulingService | null> {
    return this.repository.getById(id, companyId);
  }

  async create(
    companyId: string,
    userId: string,
    input: ServiceFormValues,
  ): Promise<SchedulingService> {
    const parsed = serviceFormSchema.parse(input);
    const payload: ServiceInsert = {
      company_id: companyId,
      name: parsed.name,
      description: parsed.description ?? null,
      duration_minutes: parsed.duration_minutes,
      status: parsed.status,
      created_by: userId,
      updated_by: userId,
    };
    return this.repository.create(payload);
  }

  async update(
    id: string,
    companyId: string,
    userId: string,
    input: ServiceFormValues,
  ): Promise<SchedulingService> {
    const parsed = serviceFormSchema.parse(input);
    const payload: ServiceUpdate = {
      name: parsed.name,
      description: parsed.description ?? null,
      duration_minutes: parsed.duration_minutes,
      status: parsed.status,
      updated_by: userId,
    };
    return this.repository.update(id, companyId, payload);
  }

  delete(id: string, companyId: string): Promise<void> {
    return this.repository.softDelete(id, companyId);
  }
}
