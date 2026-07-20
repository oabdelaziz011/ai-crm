import { ContextBuildError } from "../errors/runtime-errors.js";
import type { RuntimeContextProvider } from "./context-providers.js";
import type { ContextProviderRegistry } from "../registries/runtime-registries.js";

export type ContextBuildResult = {
  context: Record<string, unknown>;
  providerKeys: string[];
  sizeBytes: number;
};

export class ContextBuilder {
  constructor(private readonly registry: ContextProviderRegistry) {}

  build(source: Record<string, unknown>, enabledProviderKeys?: string[]): ContextBuildResult {
    try {
      const providers = enabledProviderKeys?.length
        ? enabledProviderKeys
            .map((key) => this.registry.getContextProvider(key))
            .filter((provider): provider is RuntimeContextProvider => Boolean(provider))
        : this.registry.listContextProviders();

      const merged: Record<string, unknown> = { ...source };
      for (const provider of providers) {
        Object.assign(merged, provider.resolve(source));
      }

      const serialized = JSON.stringify(merged);
      return {
        context: merged,
        providerKeys: providers.map((provider) => provider.key),
        sizeBytes: serialized.length,
      };
    } catch (error) {
      throw new ContextBuildError(error instanceof Error ? error.message : "Failed to build execution context.");
    }
  }
}
