import type { AINodeRegistry } from "./ai-node-registry.js";
import type { CapabilityRegistry } from "./capability-registry.js";
import type { ConfigurationRegistry } from "./configuration-registry.js";
import type { OutputMapperRegistry } from "./output-mapper-registry.js";
import type { ValidationRegistry } from "./validation-registry.js";
import { createDefaultAINodeRegistry } from "./ai-node-registry.js";
import { createDefaultCapabilityRegistry } from "./capability-registry.js";
import { createDefaultConfigurationRegistry } from "./configuration-registry.js";
import { createDefaultOutputMapperRegistry } from "./output-mapper-registry.js";
import { createDefaultValidationRegistry } from "./validation-registry.js";

export type AIWorkflowRegistryBundle = {
  nodes: AINodeRegistry;
  capabilities: CapabilityRegistry;
  configurations: ConfigurationRegistry;
  outputMappers: OutputMapperRegistry;
  validation: ValidationRegistry;
};

export function createDefaultAIWorkflowRegistries(): AIWorkflowRegistryBundle {
  return {
    nodes: createDefaultAINodeRegistry(),
    capabilities: createDefaultCapabilityRegistry(),
    configurations: createDefaultConfigurationRegistry(),
    outputMappers: createDefaultOutputMapperRegistry(),
    validation: createDefaultValidationRegistry(),
  };
}

export function registerAIWorkflowNode(
  registries: AIWorkflowRegistryBundle,
  definition: import("../types/configuration.js").AIWorkflowNodeDefinition,
): void {
  registries.nodes.register(definition);
  registries.capabilities.syncFromDefinition(definition);
  registries.configurations.syncFromDefinition(definition);
}
