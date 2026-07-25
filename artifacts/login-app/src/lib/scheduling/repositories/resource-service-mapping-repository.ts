import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EligibleResourceRef,
  ResourceCapabilityRef,
  ResourceServiceLink,
} from "@/lib/scheduling/types";

export class ResourceServiceMappingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByResource(resourceId: string, companyId: string): Promise<ResourceCapabilityRef[]> {
    const { data, error } = await this.client
      .from("resource_services")
      .select("scheduling_services(id, name, duration_minutes, status)")
      .eq("resource_id", resourceId)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);

    return (data ?? [])
      .map((row) => row.scheduling_services as unknown as ResourceCapabilityRef | null)
      .filter((service): service is ResourceCapabilityRef => service != null);
  }

  async listByService(
    serviceId: string,
    companyId: string,
    options?: { branchId?: string | null },
  ): Promise<EligibleResourceRef[]> {
    const { data, error } = await this.client
      .from("resource_services")
      .select(
        "scheduling_resources!inner(id, name, resource_type, status, timezone, branch_id)",
      )
      .eq("service_id", serviceId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("scheduling_resources.status", "active")
      .is("scheduling_resources.deleted_at", null);

    if (error) throw new Error(error.message);

    let resources = (data ?? [])
      .map((row) => row.scheduling_resources as unknown as EligibleResourceRef | null)
      .filter((resource): resource is EligibleResourceRef => resource != null);

    if (options?.branchId) {
      resources = resources.filter(
        (resource) =>
          resource.branch_id == null || resource.branch_id === options.branchId,
      );
    }

    return resources;
  }

  async listActiveMappingsForResource(
    resourceId: string,
    companyId: string,
  ): Promise<ResourceServiceLink[]> {
    const { data, error } = await this.client
      .from("resource_services")
      .select("*")
      .eq("resource_id", resourceId)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
    return (data ?? []) as ResourceServiceLink[];
  }

  async listActiveMappingsForService(
    serviceId: string,
    companyId: string,
  ): Promise<ResourceServiceLink[]> {
    const { data, error } = await this.client
      .from("resource_services")
      .select("*")
      .eq("service_id", serviceId)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
    return (data ?? []) as ResourceServiceLink[];
  }

  async softDeleteMapping(id: string, companyId: string): Promise<void> {
    const { error } = await this.client
      .from("resource_services")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
  }

  async insertMapping(input: {
    company_id: string;
    resource_id: string;
    service_id: string;
    created_by: string;
  }): Promise<void> {
    const { error } = await this.client.from("resource_services").insert(input);
    if (error) throw new Error(error.message);
  }

  async restoreMapping(id: string, companyId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from("resource_services")
      .update({ deleted_at: null, created_by: userId })
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) throw new Error(error.message);
  }

  async findMappingIncludingDeleted(
    resourceId: string,
    serviceId: string,
    companyId: string,
  ): Promise<ResourceServiceLink | null> {
    const { data, error } = await this.client
      .from("resource_services")
      .select("*")
      .eq("resource_id", resourceId)
      .eq("service_id", serviceId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as ResourceServiceLink | null) ?? null;
  }
}
