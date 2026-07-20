import type { RuleGroup } from "./types.js";

export type RuleProvider = {
  id: string;
  label: string;
  createDefaultRuleGroup: () => RuleGroup;
};

const providers = new Map<string, RuleProvider>();

export function registerRuleProvider(provider: RuleProvider): void {
  providers.set(provider.id, provider);
}

export function getRuleProvider(id: string): RuleProvider | undefined {
  return providers.get(id);
}

export function listRuleProviders(): RuleProvider[] {
  return [...providers.values()];
}

export function createDefaultIfElseRuleGroup(): RuleGroup {
  return {
    id: "root",
    combinator: "and",
    rules: [
      {
        id: "rule-1",
        field: "customer.type",
        operator: "equals",
        value: "VIP",
      },
    ],
  };
}

export function registerBuiltInRuleProviders(): void {
  if (providers.has("if_else")) return;
  registerRuleProvider({
    id: "if_else",
    label: "If / Else",
    createDefaultRuleGroup: createDefaultIfElseRuleGroup,
  });
}
