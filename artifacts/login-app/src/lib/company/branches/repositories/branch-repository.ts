import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BranchInsert,
  BranchListFilter,
  BranchRecord,
  BranchUpdate,
  BranchWithStats,
} from "@/lib/company/branches/types";

const PAGE_SIZE = 20;

export class BranchRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<BranchRecord[]> {
    const { data, error } = await this.client
      .from("branches")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .order("name");

    if (error) throw new Error(error.message);
    return (data ?? []) as BranchRecord[];
  }

  async listPage(
    companyId: string,
    filter: BranchListFilter = {},
    cursor?: string | null,
  ): Promise<{ items: BranchRecord[]; nextCursor: string | null }> {
    let query = this.client
      .from("branches")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .order("name")
      .limit(PAGE_SIZE + 1);

    if (filter.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }

    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      query = query.or(`name.ilike.${term},code.ilike.${term},city.ilike.${term}`);
    }

    if (cursor) {
      query = query.gt("name", cursor);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as BranchRecord[];
    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.name ?? null : null;
    return { items, nextCursor };
  }

  async getById(id: string, companyId: string): Promise<BranchRecord | null> {
    const { data, error } = await this.client
      .from("branches")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as BranchRecord | null) ?? null;
  }

  async getByCode(companyId: string, code: string, excludeId?: string): Promise<BranchRecord | null> {
    let query = this.client
      .from("branches")
      .select("*")
      .eq("company_id", companyId)
      .ilike("code", code)
      .is("deleted_at", null);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BranchRecord | null) ?? null;
  }

  async create(values: BranchInsert): Promise<BranchRecord> {
    const { data, error } = await this.client.from("branches").insert(values).select("*").single();
    if (error) throw new Error(error.message);
    return data as BranchRecord;
  }

  async update(id: string, companyId: string, values: BranchUpdate): Promise<BranchRecord> {
    const { data, error } = await this.client
      .from("branches")
      .update(values)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as BranchRecord;
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    const { error } = await this.client
      .from("branches")
      .update({ deleted_at: new Date().toISOString(), status: "archived" })
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);
  }

  async clearPrimaryForCompany(companyId: string, exceptId?: string): Promise<void> {
    let query = this.client
      .from("branches")
      .update({ is_primary: false })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("is_primary", true);

    if (exceptId) {
      query = query.neq("id", exceptId);
    }

    const { error } = await query;
    if (error) throw new Error(error.message);
  }

  async clearPrimaryExcept(companyId: string, exceptId: string): Promise<void> {
    return this.clearPrimaryForCompany(companyId, exceptId);
  }

  async countDependencies(id: string, companyId: string): Promise<{
    users: number;
    resources: number;
    bookings: number;
  }> {
    const [users, resources, bookings] = await Promise.all([
      this.client
        .from("user_branch_assignments")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id)
        .eq("company_id", companyId),
      this.client
        .from("scheduling_resources")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null),
      this.client
        .from("scheduling_bookings")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", id)
        .eq("company_id", companyId)
        .is("deleted_at", null),
    ]);

    if (users.error) throw new Error(users.error.message);
    if (resources.error) throw new Error(resources.error.message);
    if (bookings.error) throw new Error(bookings.error.message);

    return {
      users: users.count ?? 0,
      resources: resources.count ?? 0,
      bookings: bookings.count ?? 0,
    };
  }

  async attachStats(companyId: string, branches: BranchRecord[]): Promise<BranchWithStats[]> {
    if (branches.length === 0) return [];

    const branchIds = branches.map((b) => b.id);

    const [assignments, resources] = await Promise.all([
      this.client
        .from("user_branch_assignments")
        .select("branch_id")
        .eq("company_id", companyId)
        .in("branch_id", branchIds),
      this.client
        .from("scheduling_resources")
        .select("id, branch_id")
        .eq("company_id", companyId)
        .in("branch_id", branchIds)
        .is("deleted_at", null),
    ]);

    if (assignments.error) throw new Error(assignments.error.message);
    if (resources.error) throw new Error(resources.error.message);

    const resourceRows = resources.data ?? [];
    const resourceIds = resourceRows.map((row) => row.id as string);

    let serviceCounts = new Map<string, number>();
    if (resourceIds.length > 0) {
      const { data: mappings, error: mappingError } = await this.client
        .from("resource_services")
        .select("resource_id, service_id")
        .in("resource_id", resourceIds);

      if (mappingError) throw new Error(mappingError.message);

      const branchResourceIds = new Map<string, string[]>();
      for (const row of resourceRows) {
        const branchId = row.branch_id as string;
        const list = branchResourceIds.get(branchId) ?? [];
        list.push(row.id as string);
        branchResourceIds.set(branchId, list);
      }

      const servicesByBranch = new Map<string, Set<string>>();
      for (const [branchId, ids] of branchResourceIds) {
        const serviceSet = new Set<string>();
        for (const mapping of mappings ?? []) {
          if (ids.includes(mapping.resource_id as string)) {
            serviceSet.add(mapping.service_id as string);
          }
        }
        servicesByBranch.set(branchId, serviceSet);
      }

      serviceCounts = new Map(
        [...servicesByBranch.entries()].map(([branchId, set]) => [branchId, set.size]),
      );
    }

    const usersByBranch = new Map<string, number>();
    for (const row of assignments.data ?? []) {
      const branchId = row.branch_id as string;
      usersByBranch.set(branchId, (usersByBranch.get(branchId) ?? 0) + 1);
    }

    const resourcesByBranch = new Map<string, number>();
    for (const row of resourceRows) {
      const branchId = row.branch_id as string;
      resourcesByBranch.set(branchId, (resourcesByBranch.get(branchId) ?? 0) + 1);
    }

    return branches.map((branch) => ({
      ...branch,
      users_count: usersByBranch.get(branch.id) ?? 0,
      resources_count: resourcesByBranch.get(branch.id) ?? 0,
      services_count: serviceCounts.get(branch.id) ?? 0,
    }));
  }

  async getCompanyStats(companyId: string): Promise<{
    branches: number;
    users: number;
    resources: number;
    services: number;
  }> {
    const [branches, users, resources, services] = await Promise.all([
      this.client
        .from("branches")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null),
      this.client
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId),
      this.client
        .from("scheduling_resources")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null),
      this.client
        .from("scheduling_services")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .is("deleted_at", null),
    ]);

    if (branches.error) throw new Error(branches.error.message);
    if (users.error) throw new Error(users.error.message);
    if (resources.error) throw new Error(resources.error.message);
    if (services.error) throw new Error(services.error.message);

    return {
      branches: branches.count ?? 0,
      users: users.count ?? 0,
      resources: resources.count ?? 0,
      services: services.count ?? 0,
    };
  }
}
