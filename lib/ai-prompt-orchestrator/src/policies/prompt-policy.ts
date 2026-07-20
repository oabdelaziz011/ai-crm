export type PromptPolicy = {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  allowedProviders?: string[];
  allowedModels?: string[];
  jsonMode?: boolean;
};

export class PromptPolicyRegistry {
  private readonly policies = new Map<string, PromptPolicy>();

  register(key: string, policy: PromptPolicy): this {
    this.policies.set(key, policy);
    return this;
  }

  resolve(key?: string | null): PromptPolicy {
    if (key && this.policies.has(key)) {
      return this.policies.get(key)!;
    }
    return this.policies.get("default") ?? {};
  }

  validateExecution(policy: PromptPolicy, input: { providerKey?: string; model?: string }): string[] {
    const issues: string[] = [];
    if (policy.allowedProviders?.length && input.providerKey) {
      if (!policy.allowedProviders.includes(input.providerKey)) {
        issues.push(`Provider ${input.providerKey} is not allowed by prompt policy.`);
      }
    }
    if (policy.allowedModels?.length && input.model) {
      if (!policy.allowedModels.includes(input.model)) {
        issues.push(`Model ${input.model} is not allowed by prompt policy.`);
      }
    }
    return issues;
  }

  keys(): string[] {
    return [...this.policies.keys()].sort();
  }
}

export function createDefaultPromptPolicyRegistry(): PromptPolicyRegistry {
  const registry = new PromptPolicyRegistry();
  registry.register("default", {
    maxTokens: 4096,
    temperature: 0.7,
    topP: 1,
    jsonMode: false,
  });
  registry.register("strict_json", {
    maxTokens: 2048,
    temperature: 0,
    topP: 1,
    jsonMode: true,
    allowedProviders: ["openai", "azure_openai", "mock"],
  });
  return registry;
}
