import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrganizationRegion,
  BranchGroup,
  BranchProfile,
  OrganizationDepartment,
  OrganizationPolicy,
  ResourceAssignment,
} from "@/lib/organization/types";

function mapRegion(row: Record<string, unknown>): OrganizationRegion {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    code: row.code ? String(row.code) : null,
    description: row.description ? String(row.description) : null,
    managerUserId: row.manager_user_id ? String(row.manager_user_id) : null,
    timezone: String(row.timezone ?? "UTC"),
    isActive: Boolean(row.is_active),
  };
}

function mapBranch(row: Record<string, unknown>): BranchProfile {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    code: row.code ? String(row.code) : null,
    regionId: row.region_id ? String(row.region_id) : null,
    branchGroupId: row.branch_group_id ? String(row.branch_group_id) : null,
    timezone: String(row.timezone ?? "UTC"),
    currency: String(row.currency ?? "USD"),
    healthScore: Number(row.health_score ?? 100),
    status: String(row.status ?? "active"),
    branding: (row.branding as Record<string, unknown>) ?? {},
    settings: (row.settings as Record<string, unknown>) ?? {},
  };
}

/** Organization hierarchy data access. */
export class OrganizationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listRegions(companyId: string): Promise<OrganizationRegion[]> {
    const { data, error } = await this.client
      .from("organization_regions")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRegion);
  }

  async listBranchGroups(companyId: string, regionId?: string | null): Promise<BranchGroup[]> {
    let query = this.client
      .from("organization_branch_groups")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true);
    if (regionId) query = query.eq("region_id", regionId);
    const { data, error } = await query.order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      regionId: row.region_id ? String(row.region_id) : null,
      name: String(row.name),
      code: row.code ? String(row.code) : null,
      isActive: Boolean(row.is_active),
    }));
  }

  async listBranches(companyId: string, regionId?: string | null): Promise<BranchProfile[]> {
    let query = this.client
      .from("branches")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (regionId) query = query.eq("region_id", regionId);
    const { data, error } = await query.order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapBranch);
  }

  async listDepartments(companyId: string, branchId?: string): Promise<OrganizationDepartment[]> {
    let query = this.client
      .from("organization_departments")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true);
    if (branchId) query = query.eq("branch_id", branchId);
    const { data, error } = await query.order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      branchId: String(row.branch_id),
      name: String(row.name),
      code: row.code ? String(row.code) : null,
      departmentType: row.department_type as OrganizationDepartment["departmentType"],
      isActive: Boolean(row.is_active),
    }));
  }

  async listPolicies(companyId: string): Promise<OrganizationPolicy[]> {
    const { data, error } = await this.client
      .from("organization_policies")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      scopeLevel: row.scope_level as OrganizationPolicy["scopeLevel"],
      scopeId: row.scope_id ? String(row.scope_id) : null,
      policyType: row.policy_type as OrganizationPolicy["policyType"],
      config: (row.config as Record<string, unknown>) ?? {},
      inheritsFromParent: Boolean(row.inherits_from_parent),
      priority: Number(row.priority),
      isActive: Boolean(row.is_active),
    }));
  }

  async listResourceAssignments(companyId: string, branchId?: string): Promise<ResourceAssignment[]> {
    let query = this.client
      .from("organization_resource_assignments")
      .select("*, scheduling_resources(name, resource_type)")
      .eq("company_id", companyId)
      .eq("is_active", true);
    if (branchId) query = query.eq("branch_id", branchId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const resource = row.scheduling_resources as { name?: string; resource_type?: string } | null;
      return {
        id: String(row.id),
        companyId: String(row.company_id),
        branchId: String(row.branch_id),
        departmentId: row.department_id ? String(row.department_id) : null,
        resourceId: String(row.resource_id),
        resourceName: resource?.name,
        resourceType: resource?.resource_type,
        assignmentType: row.assignment_type as ResourceAssignment["assignmentType"],
        utilizationTargetPercent: Number(row.utilization_target_percent),
        maintenanceStatus: row.maintenance_status as ResourceAssignment["maintenanceStatus"],
        isActive: Boolean(row.is_active),
      };
    });
  }

  async resolvePolicyRpc(companyId: string, branchId: string, policyType: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.client.rpc("organization_resolve_policy", {
      p_company_id: companyId,
      p_branch_id: branchId,
      p_policy_type: policyType,
    });
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>) ?? {};
  }

  async search(companyId: string, query: string, limit = 20) {
    const { data, error } = await this.client.rpc("organization_search", {
      p_company_id: companyId,
      p_query: query,
      p_limit: limit,
    });
    if (error) throw new Error(error.message);
    return (data as Array<{ type: string; id: string; label: string }>) ?? [];
  }

  async audit(companyId: string, action: string, entityType: string, entityId: string, actorId?: string, metadata?: Record<string, unknown>) {
    await this.client.from("organization_audit_log").insert({
      company_id: companyId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      actor_id: actorId ?? null,
      metadata: metadata ?? {},
    });
  }

  async listBranchBookingsForDate(companyId: string, branchId: string, date: string) {
    const { data, error } = await this.client
      .from("scheduling_bookings")
      .select("status, scheduling_services(price_cents)")
      .eq("company_id", companyId)
      .eq("branch_id", branchId)
      .gte("start_at", `${date}T00:00:00.000Z`)
      .lt("start_at", `${date}T23:59:59.999Z`)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return (data ?? []).map((b) => {
      const svc = b.scheduling_services as { price_cents?: number } | { price_cents?: number }[] | null;
      const price = Array.isArray(svc) ? svc[0]?.price_cents : svc?.price_cents;
      return { status: String(b.status), priceCents: Number(price ?? 0) };
    });
  }
}
