import type {
  DashboardMetricCategory,
  DashboardMetricProvider,
  DashboardQueryFilter,
} from "./types.js";

export class DashboardMetricRegistry {
  private readonly providers = new Map<string, DashboardMetricProvider>();
  private readonly categories = new Map<string, DashboardMetricCategory>();

  registerProvider(provider: DashboardMetricProvider): void {
    this.providers.set(provider.providerId, provider);
    if (!this.categories.has(String(provider.category))) {
      this.categories.set(String(provider.category), provider.category);
    }
  }

  registerCategory(category: DashboardMetricCategory): void {
    this.categories.set(String(category), category);
  }

  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  getProvider(providerId: string): DashboardMetricProvider | undefined {
    return this.providers.get(providerId);
  }

  listProviders(): DashboardMetricProvider[] {
    return [...this.providers.values()];
  }

  listProvidersForQuery(filter?: DashboardQueryFilter): DashboardMetricProvider[] {
    const categoryFilter = filter?.categories?.length
      ? new Set(filter.categories.map(String))
      : null;
    const providerFilter = filter?.providerIds?.length
      ? new Set(filter.providerIds.map(String))
      : null;

    return this.listProviders().filter((provider) => {
      if (providerFilter && !providerFilter.has(provider.providerId)) return false;
      if (categoryFilter && !categoryFilter.has(String(provider.category))) return false;
      return true;
    });
  }

  listCategories(): DashboardMetricCategory[] {
    return [...this.categories.values()];
  }
}

export const globalDashboardMetricRegistry = new DashboardMetricRegistry();
