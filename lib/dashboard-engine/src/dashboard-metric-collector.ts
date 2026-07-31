import type {
  DashboardAccess,
  DashboardCollectInput,
  DashboardMetricProvider,
  DashboardProviderSnapshot,
} from "./types.js";
import type { DashboardMetricRegistry } from "./dashboard-metric-registry.js";
import { dashboardPermissionService } from "./dashboard-permission-service.js";

export type DashboardProviderExecution = {
  providerId: string;
  category: DashboardProviderSnapshot["category"];
  status: "success" | "failed" | "skipped";
  snapshot?: DashboardProviderSnapshot;
  error?: string;
};

function assertSnapshotTenant(
  snapshot: DashboardProviderSnapshot,
  companyId: string,
): DashboardProviderSnapshot {
  if (snapshot.companyId !== companyId) {
    return {
      ...snapshot,
      metrics: [],
      warnings: [
        ...(snapshot.warnings ?? []),
        `Rejected ${snapshot.metrics.length} metric(s) due to tenant mismatch.`,
      ],
    };
  }
  return snapshot;
}

export class DashboardMetricCollector {
  constructor(private readonly registry: DashboardMetricRegistry) {}

  resolveProviders(access: DashboardAccess, input: DashboardCollectInput): DashboardMetricProvider[] {
    const candidates = this.registry.listProvidersForQuery(input.filter);
    return dashboardPermissionService.filterProvidersByPermission(access, candidates);
  }

  async collectFromProviders(
    access: DashboardAccess,
    input: DashboardCollectInput,
    providers: DashboardMetricProvider[],
  ): Promise<DashboardProviderExecution[]> {
    if (providers.length === 0) return [];

    return Promise.all(
      providers.map(async (provider) => {
        try {
          const snapshot = assertSnapshotTenant(
            await provider.collect(access, input),
            input.companyId,
          );

          return {
            providerId: provider.providerId,
            category: provider.category,
            status: "success" as const,
            snapshot,
          };
        } catch (error) {
          return {
            providerId: provider.providerId,
            category: provider.category,
            status: "failed" as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
  }

  async collect(
    access: DashboardAccess,
    input: DashboardCollectInput,
  ): Promise<DashboardProviderExecution[]> {
    const providers = this.resolveProviders(access, input);
    return this.collectFromProviders(access, input, providers);
  }
}
