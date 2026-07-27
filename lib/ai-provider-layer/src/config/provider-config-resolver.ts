export type TenantProviderConfiguration = {
  defaultProviderKey: string;
  defaultModel?: string;
  providerPriority: string[];
  connections: Record<string, Record<string, unknown>>;
};

export type ProviderConfigurationResolverInput = {
  companyId: string;
  providerKey?: string;
  connectionConfiguration?: Record<string, unknown>;
  tenantConfig?: Partial<TenantProviderConfiguration>;
};

export class ProviderConfigurationResolver {
  resolve(input: ProviderConfigurationResolverInput): {
    providerKey: string;
    configuration: Record<string, unknown>;
  } {
    const tenant = input.tenantConfig;
    const providerKey =
      input.providerKey ??
      tenant?.defaultProviderKey ??
      tenant?.providerPriority?.[0] ??
      "openai";

    const baseConfiguration: Record<string, unknown> = {
      ...(tenant?.connections?.[providerKey] ?? {}),
      ...(input.connectionConfiguration ?? {}),
    };

    if (tenant?.defaultModel && baseConfiguration.model == null) {
      baseConfiguration.model = tenant.defaultModel;
    }

    return { providerKey, configuration: baseConfiguration };
  }

  resolveFallbackOrder(input: ProviderConfigurationResolverInput): string[] {
    const primary = this.resolve(input).providerKey;
    const priority = input.tenantConfig?.providerPriority ?? [];
    return [...new Set([primary, ...priority, "mock"])];
  }
}
