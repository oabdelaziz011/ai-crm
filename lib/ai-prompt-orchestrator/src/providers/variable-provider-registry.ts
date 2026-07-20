import type { PromptVariableProvider } from "./variable-providers.js";

export class VariableProviderRegistry {
  private readonly providers = new Map<string, PromptVariableProvider>();

  register(provider: PromptVariableProvider): this {
    this.providers.set(provider.key, provider);
    return this;
  }

  registerMany(providers: PromptVariableProvider[]): this {
    for (const provider of providers) this.register(provider);
    return this;
  }

  get(key: string): PromptVariableProvider | undefined {
    return this.providers.get(key);
  }

  list(): PromptVariableProvider[] {
    return [...this.providers.values()];
  }

  keys(): string[] {
    return [...this.providers.keys()].sort();
  }
}

export function createDefaultVariableProviderRegistry(
  providers: PromptVariableProvider[],
): VariableProviderRegistry {
  const registry = new VariableProviderRegistry();
  for (const provider of providers) registry.register(provider);
  return registry;
}
