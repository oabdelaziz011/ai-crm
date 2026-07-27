import type { SupabaseClient } from "@supabase/supabase-js";
import type { BranchRecord } from "@/lib/company/branches/types";

export class ServiceBranchAvailabilityService {
  constructor(private readonly client: SupabaseClient) {}

  /** Branches where at least one mapped resource for the service is assigned. */
  async listForService(companyId: string, serviceId: string): Promise<Pick<BranchRecord, "id" | "name" | "code">[]> {
    const map = await this.listMapForCompany(companyId);
    return map.get(serviceId) ?? [];
  }

  async listMapForCompany(
    companyId: string,
  ): Promise<Map<string, Pick<BranchRecord, "id" | "name" | "code">[]>> {
    const { data: resources, error: resourceError } = await this.client
      .from("scheduling_resources")
      .select("id, branch_id, branches(id, name, code)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .not("branch_id", "is", null);

    if (resourceError) throw new Error(resourceError.message);

    const resourceRows = resources ?? [];
    const resourceIds = resourceRows.map((row) => row.id as string);
    if (resourceIds.length === 0) {
      return new Map();
    }

    const { data: mappings, error: mappingError } = await this.client
      .from("resource_services")
      .select("resource_id, service_id")
      .in("resource_id", resourceIds);

    if (mappingError) throw new Error(mappingError.message);

    const resourceBranchMap = new Map<string, Pick<BranchRecord, "id" | "name" | "code">>();
    for (const row of resourceRows) {
      const branchRaw = row.branches;
      const branch = (Array.isArray(branchRaw) ? branchRaw[0] : branchRaw) as
        | Pick<BranchRecord, "id" | "name" | "code">
        | null;
      if (branch?.id) {
        resourceBranchMap.set(row.id as string, branch);
      }
    }

    const result = new Map<string, Pick<BranchRecord, "id" | "name" | "code">[]>();
    for (const mapping of mappings ?? []) {
      const serviceId = mapping.service_id as string;
      const branch = resourceBranchMap.get(mapping.resource_id as string);
      if (!branch) continue;

      const list = result.get(serviceId) ?? [];
      if (!list.some((item) => item.id === branch.id)) {
        list.push(branch);
      }
      result.set(serviceId, list);
    }

    for (const [serviceId, branches] of result) {
      result.set(serviceId, [...branches].sort((a, b) => a.name.localeCompare(b.name)));
    }

    return result;
  }
}
