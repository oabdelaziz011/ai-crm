import type { AIWorkflowNodeConfig } from "../types/configuration.js";
import { createDefaultAIWorkflowNodeConfig } from "../types/configuration.js";
import type { AIWorkflowNodeDefinition } from "../types/configuration.js";

export class ConfigurationRegistry {
  private readonly defaults = new Map<string, Partial<AIWorkflowNodeConfig>>();

  register(nodeKey: string, defaults: Partial<AIWorkflowNodeConfig>): this {
    this.defaults.set(nodeKey, defaults);
    return this;
  }

  resolve(nodeKey: string, overrides: Partial<AIWorkflowNodeConfig> = {}): AIWorkflowNodeConfig {
    const base = this.defaults.get(nodeKey) ?? {};
    return createDefaultAIWorkflowNodeConfig(nodeKey, { ...base, ...overrides, nodeKey });
  }

  syncFromDefinition(definition: AIWorkflowNodeDefinition): this {
    return this.register(definition.key, definition.defaultConfig);
  }
}

export function createDefaultConfigurationRegistry(): ConfigurationRegistry {
  return new ConfigurationRegistry();
}
