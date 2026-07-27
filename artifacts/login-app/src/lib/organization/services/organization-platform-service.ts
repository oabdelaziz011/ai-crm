import type { SupabaseClient } from "@supabase/supabase-js";
import { OrganizationRepository } from "@/lib/organization/repositories/organization-repository";
import { TransferEngineService } from "@/lib/organization/transfers/transfer-engine-service";
import { buildHierarchyTree, computeAverageHealthScore } from "@/lib/organization/selectors/hierarchy-selector";
import { resolvePolicyChain } from "@/lib/organization/selectors/policy-selector";
import { buildBranchComparison, buildHeatmap } from "@/lib/organization/analytics/enterprise-analytics-selector";
import type {
  EnterpriseAnalytics,
  OrganizationOverview,
  PolicyType,
  SearchResult,
  CrossBranchCustomerView,
} from "@/lib/organization/types";
import { getBranchServices } from "@/lib/company/branches";

/** Policy inheritance service. */
export class PolicyInheritanceService {
  constructor(private readonly repo: OrganizationRepository) {}

  async resolve(companyId: string, branchId: string, regionId: string | null, branchGroupId: string | null, policyType: PolicyType) {
    const policies = await this.repo.listPolicies(companyId);
    return resolvePolicyChain(policies, branchId, regionId, branchGroupId, policyType);
  }

  async resolveViaRpc(companyId: string, branchId: string, policyType: PolicyType) {
    return this.repo.resolvePolicyRpc(companyId, branchId, policyType);
  }
}

/** Enterprise search service. */
export class EnterpriseSearchService {
  constructor(private readonly repo: OrganizationRepository) {}

  async search(companyId: string, query: string, limit = 20): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const results = await this.repo.search(companyId, query, limit);
    return results.map((r) => ({
      type: r.type as SearchResult["type"],
      id: r.id,
      label: r.label,
    }));
  }
}

/** Cross-branch customer view. */
export class CrossBranchCustomerService {
  constructor(private readonly client: SupabaseClient) {}

  async getProfile(companyId: string, customerId: string): Promise<CrossBranchCustomerView> {
    const { data: customer } = await this.client
      .from("customers")
      .select("id, name")
      .eq("id", customerId)
      .maybeSingle();

    const { data: bookings } = await this.client
      .from("scheduling_bookings")
      .select("branch_id, branches(name)")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .is("deleted_at", null);

    const byBranch = new Map<string, { branchName: string; count: number }>();
    for (const b of bookings ?? []) {
      const branchId = String(b.branch_id ?? "unknown");
      const branch = b.branches as { name?: string } | { name?: string }[] | null;
      const name = Array.isArray(branch) ? branch[0]?.name ?? branchId : branch?.name ?? branchId;
      const existing = byBranch.get(branchId) ?? { branchName: name, count: 0 };
      byBranch.set(branchId, { branchName: name, count: existing.count + 1 });
    }

    return {
      customerId,
      name: customer?.name ?? "Customer",
      totalVisits: bookings?.length ?? 0,
      branchVisits: [...byBranch.entries()].map(([branchId, v]) => ({
        branchId,
        branchName: v.branchName,
        visitCount: v.count,
      })),
      sharedTimeline: true,
      sharedInvoices: true,
    };
  }
}

/** Main organization platform orchestrator. */
export class OrganizationPlatformService {
  private readonly repo: OrganizationRepository;
  readonly transfers: TransferEngineService;
  readonly policies: PolicyInheritanceService;
  readonly search: EnterpriseSearchService;
  readonly customers: CrossBranchCustomerService;

  constructor(client: SupabaseClient) {
    this.repo = new OrganizationRepository(client);
    this.transfers = new TransferEngineService(client);
    this.policies = new PolicyInheritanceService(this.repo);
    this.search = new EnterpriseSearchService(this.repo);
    this.customers = new CrossBranchCustomerService(client);
  }

  async getOverview(companyId: string): Promise<OrganizationOverview> {
    const [regions, groups, branches, departments, resources, pendingTransfers] = await Promise.all([
      this.repo.listRegions(companyId),
      this.repo.listBranchGroups(companyId),
      this.repo.listBranches(companyId),
      this.repo.listDepartments(companyId),
      this.repo.listResourceAssignments(companyId),
      this.transfers.listPending(companyId),
    ]);

    return {
      regionCount: regions.length,
      branchCount: branches.length,
      departmentCount: departments.length,
      resourceCount: resources.length,
      pendingTransfers: pendingTransfers.length,
      averageHealthScore: computeAverageHealthScore(branches),
      hierarchy: buildHierarchyTree(regions, groups, branches),
    };
  }

  async getAnalytics(companyId: string, date: string): Promise<EnterpriseAnalytics> {
    const branches = await this.repo.listBranches(companyId);
    const regions = await this.repo.listRegions(companyId);
    const regionMap = new Map(regions.map((r) => [r.id, r.name]));

    const branchData = await Promise.all(
      branches.map(async (branch) => ({
        branchId: branch.id,
        branchName: branch.name,
        regionName: branch.regionId ? regionMap.get(branch.regionId) ?? null : null,
        healthScore: branch.healthScore,
        bookings: await this.repo.listBranchBookingsForDate(companyId, branch.id, date),
      })),
    );

    const comparisons = buildBranchComparison(branchData);
    const sorted = [...comparisons].sort((a, b) => b.revenueCents - a.revenueCents);

    return {
      comparisons,
      topPerformers: sorted.slice(0, 5),
      underperformers: sorted.slice(-3).reverse(),
      heatmap: buildHeatmap(comparisons),
    };
  }

  get branches() {
    return getBranchServices().branches;
  }
}
