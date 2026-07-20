import { createDefaultPromptComposerRegistry } from "../composition/prompt-composer.js";
import { createDefaultPromptPolicyRegistry } from "../policies/prompt-policy.js";
import { createDefaultVariableProviders } from "../providers/variable-providers.js";
import { createDefaultVariableProviderRegistry } from "../providers/variable-provider-registry.js";
import { PromptRenderer } from "../rendering/prompt-renderer.js";
import { PromptValidator } from "../validation/prompt-validator.js";

export type PromptPlatformRegistries = {
  renderer: PromptRenderer;
  validator: PromptValidator;
  variableProviders: ReturnType<typeof createDefaultVariableProviderRegistry>;
  policies: ReturnType<typeof createDefaultPromptPolicyRegistry>;
  composers: ReturnType<typeof createDefaultPromptComposerRegistry>;
};

export function createPromptPlatformRegistries(): PromptPlatformRegistries {
  const variableProviders = createDefaultVariableProviderRegistry(createDefaultVariableProviders());
  return {
    renderer: new PromptRenderer(variableProviders),
    validator: new PromptValidator(),
    variableProviders,
    policies: createDefaultPromptPolicyRegistry(),
    composers: createDefaultPromptComposerRegistry(),
  };
}

export class PromptFilterRegistry {
  private readonly filters = new Map<string, (value: string) => string>();

  register(key: string, filter: (value: string) => string): this {
    this.filters.set(key, filter);
    return this;
  }

  apply(key: string, value: string): string {
    return this.filters.get(key)?.(value) ?? value;
  }
}

export function createDefaultPromptFilterRegistry(): PromptFilterRegistry {
  const registry = new PromptFilterRegistry();
  registry.register("uppercase", (value) => value.toUpperCase());
  registry.register("trim", (value) => value.trim());
  return registry;
}
