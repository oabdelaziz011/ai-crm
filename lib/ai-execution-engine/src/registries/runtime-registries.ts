import { createDefaultRuntimeContextProviders, type RuntimeContextProvider } from "../context/context-providers.js";
import { createDefaultContextPolicyRegistry, type ContextPolicyRegistry } from "../context/context-policy.js";
import { createDefaultRuntimeCacheRegistry, type RuntimeCacheRegistry } from "../cache/runtime-cache.js";
import { createDefaultRuntimeHookRegistry, type RuntimeHookRegistry } from "../hooks/runtime-hooks.js";
import { createDefaultRuntimeMiddlewareRegistry, type RuntimeMiddlewareRegistry } from "../middleware/runtime-middleware.js";

export class ContextProviderRegistry {
  private readonly providers = new Map<string, RuntimeContextProvider>();

  register(provider: RuntimeContextProvider): this {
    this.providers.set(provider.key, provider);
    return this;
  }

  getContextProvider(key: string): RuntimeContextProvider | undefined {
    return this.providers.get(key);
  }

  listContextProviders(): RuntimeContextProvider[] {
    return [...this.providers.values()];
  }
}

export class RuntimeRegistryBundle {
  constructor(
    readonly contextProviders: ContextProviderRegistry,
    readonly contextPolicies: ContextPolicyRegistry,
    readonly hooks: RuntimeHookRegistry,
    readonly middleware: RuntimeMiddlewareRegistry,
    readonly cache: RuntimeCacheRegistry,
  ) {}
}

export function createDefaultRuntimeRegistries(): RuntimeRegistryBundle {
  const contextProviders = new ContextProviderRegistry();
  for (const provider of createDefaultRuntimeContextProviders()) {
    contextProviders.register(provider);
  }

  return new RuntimeRegistryBundle(
    contextProviders,
    createDefaultContextPolicyRegistry(),
    createDefaultRuntimeHookRegistry(),
    createDefaultRuntimeMiddlewareRegistry(),
    createDefaultRuntimeCacheRegistry(),
  );
}
