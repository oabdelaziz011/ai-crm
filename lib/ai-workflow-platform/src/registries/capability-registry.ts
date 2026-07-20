import type { AIWorkflowCapability } from "../constants.js";
import type { AIWorkflowNodeDefinition } from "../types/configuration.js";

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Set<AIWorkflowCapability>>();

  register(nodeKey: string, capabilities: AIWorkflowCapability[]): this {
    this.capabilities.set(nodeKey, new Set(capabilities));
    return this;
  }

  get(nodeKey: string): AIWorkflowCapability[] {
    return [...(this.capabilities.get(nodeKey) ?? [])];
  }

  has(nodeKey: string, capability: AIWorkflowCapability): boolean {
    return this.capabilities.get(nodeKey)?.has(capability) ?? false;
  }

  assert(nodeKey: string, required: AIWorkflowCapability[]): void {
    const available = this.capabilities.get(nodeKey) ?? new Set();
    const missing = required.filter((capability) => !available.has(capability));
    if (missing.length > 0) {
      throw new Error(`Node ${nodeKey} missing capabilities: ${missing.join(", ")}`);
    }
  }

  syncFromDefinition(definition: AIWorkflowNodeDefinition): this {
    return this.register(definition.key, definition.capabilities);
  }
}

export function createDefaultCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistry();
}
