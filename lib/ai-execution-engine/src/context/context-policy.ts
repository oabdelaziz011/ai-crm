export type ContextPolicy = {
  includeCustomer: boolean;
  includeCustomer360: boolean;
  includeBooking: boolean;
  includeConversation: boolean;
  includeWorkflowVariables: boolean;
  includeCompany: boolean;
  includeKnowledge: boolean;
  includeMetadata: boolean;
};

export const DEFAULT_CONTEXT_POLICY: ContextPolicy = {
  includeCustomer: true,
  includeCustomer360: true,
  includeBooking: true,
  includeConversation: true,
  includeWorkflowVariables: true,
  includeCompany: true,
  includeKnowledge: true,
  includeMetadata: true,
};

export class ContextPolicyRegistry {
  private readonly policies = new Map<string, ContextPolicy>();

  register(key: string, policy: ContextPolicy): this {
    this.policies.set(key, policy);
    return this;
  }

  resolve(key?: string | null, overrides?: Partial<ContextPolicy>): ContextPolicy {
    const base = (key && this.policies.get(key)) || this.policies.get("default") || DEFAULT_CONTEXT_POLICY;
    return { ...base, ...overrides };
  }

  enabledProviders(policy: ContextPolicy): string[] {
    const providers: string[] = ["system", "execution"];
    if (policy.includeCustomer) providers.push("customer");
    if (policy.includeCustomer360) providers.push("customer360");
    if (policy.includeBooking) providers.push("booking");
    if (policy.includeConversation) providers.push("conversation");
    if (policy.includeWorkflowVariables) providers.push("workflow");
    if (policy.includeCompany) providers.push("company");
    if (policy.includeKnowledge) providers.push("knowledge");
    return providers;
  }
}

export function createDefaultContextPolicyRegistry(): ContextPolicyRegistry {
  const registry = new ContextPolicyRegistry();
  registry.register("default", DEFAULT_CONTEXT_POLICY);
  registry.register("minimal", {
    includeCustomer: false,
    includeCustomer360: false,
    includeBooking: false,
    includeConversation: true,
    includeWorkflowVariables: false,
    includeCompany: true,
    includeKnowledge: true,
    includeMetadata: false,
  });
  return registry;
}
