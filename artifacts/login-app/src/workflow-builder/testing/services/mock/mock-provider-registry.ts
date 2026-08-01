import type { MockDataBundle, MockDataPreset } from "../../types/testing-types";

export type MockDataProvider = {
  preset: MockDataPreset;
  label: string;
  variables: Record<string, unknown>;
};

export type MockProviderRegistry = {
  register(provider: MockDataProvider): void;
  get(preset: MockDataPreset): MockDataProvider | null;
  list(): MockDataBundle[];
};

export function createMockProviderRegistry(providers: readonly MockDataProvider[] = []): MockProviderRegistry {
  const registry = new Map<MockDataPreset, MockDataProvider>();
  for (const provider of providers) {
    registry.set(provider.preset, provider);
  }

  return {
    register(provider) {
      registry.set(provider.preset, provider);
    },
    get(preset) {
      return registry.get(preset) ?? null;
    },
    list() {
      return [...registry.values()].map((provider) => ({
        preset: provider.preset,
        label: provider.label,
        variables: provider.variables,
      }));
    },
  };
}
