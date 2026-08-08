import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrganizationRegion,
  BranchGroup,
  BranchProfile,
  OrganizationDepartment,
  OrganizationDepartmentDependencies,
  OrganizationDepartmentInput,
  OrganizationDepartmentStats,
  OrganizationDepartmentWithStats,
  OrganizationPolicy,
  ResourceAssignment,
} from "@/lib/organization/types";

function mapDepartment(row: Record<string, unknown>): OrganizationDepartment {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    branchId: String(row.branch_id),
    name: String(row.name),
    code: row.code ? String(row.code) : null,
    departmentType: row.department_type as OrganizationDepartment["departmentType"],
    isActive: Boolean(row.is_active),
    managerUserId: row.manager_user_id ? String(row.manager_user_id) : null,
    parentId: row.parent_id ? String(row.parent_id) : null,
    description: row.description ? String(row.description) : null,
  };
}

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

  async listDepartments(
    companyId: string,
    branchId?: string,
    options: { includeInactive?: boolean } = {},
  ): Promise<OrganizationDepartment[]> {
    let query = this.client
      .from("organization_departments")
      .select("*")
      .eq("company_id", companyId);
    if (!options.includeInactive) {
      query = query.eq("is_active", true);
    }
    if (branchId) query = query.eq("branch_id", branchId);
    const { data, error } = await query.order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapDepartment(row as Record<string, unknown>));
  }

  async createDepartment(
    companyId: string,
    input: OrganizationDepartmentInput,
  ): Promise<OrganizationDepartment> {
    const { data, error } = await this.client
      .from("organization_departments")
      .insert({
        company_id: companyId,
        branch_id: input.branchId,
        name: input.name.trim(),
        code: input.code?.trim() || null,
        department_type: input.departmentType ?? "general",
        is_active: input.isActive ?? true,
        manager_user_id: input.managerUserId || null,
        parent_id: input.parentId || null,
        description: input.description?.trim() || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapDepartment(data as Record<string, unknown>);
  }

  async updateDepartment(
    id: string,
    companyId: string,
    input: Partial<OrganizationDepartmentInput> & { previousName?: string | null },
  ): Promise<OrganizationDepartment> {
    const patch: Record<string, unknown> = {};
    if (input.branchId !== undefined) patch.branch_id = input.branchId;
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.code !== undefined) patch.code = input.code?.trim() || null;
    if (input.departmentType !== undefined) patch.department_type = input.departmentType;
    if (input.isActive !== undefined) patch.is_active = input.isActive;
    if (input.managerUserId !== undefined) patch.manager_user_id = input.managerUserId || null;
    if (input.parentId !== undefined) patch.parent_id = input.parentId || null;
    if (input.description !== undefined) patch.description = input.description?.trim() || null;

    const { data, error } = await this.client
      .from("organization_departments")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const department = mapDepartment(data as Record<string, unknown>);

    // Keep employee label in sync when renaming (profiles.department is a display string).
    if (
      input.name !== undefined &&
      input.previousName &&
      input.previousName.trim() &&
      input.previousName.trim().toLowerCase() !== department.name.toLowerCase()
    ) {
      const { error: profileError } = await this.client
        .from("profiles")
        .update({ department: department.name })
        .eq("company_id", companyId)
        .ilike("department", input.previousName.trim());
      if (profileError) throw new Error(profileError.message);
    }

    return department;
  }

  async setDepartmentActive(
    id: string,
    companyId: string,
    isActive: boolean,
  ): Promise<OrganizationDepartment> {
    return this.updateDepartment(id, companyId, { isActive });
  }

  async countDepartmentDependencies(
    id: string,
    companyId: string,
    departmentName: string,
  ): Promise<OrganizationDepartmentDependencies> {
    const [resources, children, employees] = await Promise.all([
      this.client
        .from("organization_resource_assignments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("department_id", id)
        .eq("is_active", true),
      this.client
        .from("organization_departments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("parent_id", id)
        .eq("is_active", true),
      this.client
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .ilike("department", departmentName.trim()),
    ]);

    if (resources.error) throw new Error(resources.error.message);
    if (children.error) throw new Error(children.error.message);
    if (employees.error) throw new Error(employees.error.message);

    return {
      resources: resources.count ?? 0,
      children: children.count ?? 0,
      employees: employees.count ?? 0,
    };
  }

  async deleteDepartment(id: string, companyId: string, departmentName: string): Promise<void> {
    const deps = await this.countDepartmentDependencies(id, companyId, departmentName);
    if (deps.employees > 0 || deps.resources > 0 || deps.children > 0) {
      throw new Error("DEP_HAS_DEPENDENCIES");
    }

    const { error } = await this.client
      .from("organization_departments")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  }

  async mergeDepartments(sourceId: string, targetId: string): Promise<void> {
    const { error } = await this.client.rpc("organization_merge_departments", {
      p_source_id: sourceId,
      p_target_id: targetId,
    });
    if (error) throw new Error(error.message);
  }

  async attachDepartmentStats(
    companyId: string,
    departments: OrganizationDepartment[],
  ): Promise<OrganizationDepartmentWithStats[]> {
    if (departments.length === 0) return [];

    const departmentIds = departments.map((d) => d.id);
    const [profiles, assignments] = await Promise.all([
      this.client.from("profiles").select("department").eq("company_id", companyId),
      this.client
        .from("organization_resource_assignments")
        .select("department_id, resource_id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .in("department_id", departmentIds),
    ]);

    if (profiles.error) throw new Error(profiles.error.message);
    if (assignments.error) throw new Error(assignments.error.message);

    const employeesByName = new Map<string, number>();
    for (const row of profiles.data ?? []) {
      const key = typeof row.department === "string" ? row.department.trim().toLowerCase() : "";
      if (!key) continue;
      employeesByName.set(key, (employeesByName.get(key) ?? 0) + 1);
    }

    const resourcesByDept = new Map<string, Set<string>>();
    for (const row of assignments.data ?? []) {
      const deptId = row.department_id as string | null;
      const resourceId = row.resource_id as string | null;
      if (!deptId || !resourceId) continue;
      const set = resourcesByDept.get(deptId) ?? new Set<string>();
      set.add(resourceId);
      resourcesByDept.set(deptId, set);
    }

    const resourceIds = [...new Set((assignments.data ?? []).map((r) => r.resource_id as string))];
    const operationsByResource = new Map<string, number>();
    if (resourceIds.length > 0) {
      const { data: bookings, error: bookingsError } = await this.client
        .from("scheduling_bookings")
        .select("resource_id")
        .eq("company_id", companyId)
        .in("resource_id", resourceIds)
        .is("deleted_at", null);
      if (bookingsError) throw new Error(bookingsError.message);
      for (const row of bookings ?? []) {
        const resourceId = row.resource_id as string;
        operationsByResource.set(resourceId, (operationsByResource.get(resourceId) ?? 0) + 1);
      }
    }

    return departments.map((dept) => {
      const resourceSet = resourcesByDept.get(dept.id) ?? new Set<string>();
      let operations = 0;
      for (const resourceId of resourceSet) {
        operations += operationsByResource.get(resourceId) ?? 0;
      }
      const stats: OrganizationDepartmentStats = {
        employees: employeesByName.get(dept.name.trim().toLowerCase()) ?? 0,
        resources: resourceSet.size,
        operations,
      };
      return { ...dept, ...stats };
    });
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
