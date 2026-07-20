import type { AIWorkflowNodeDefinition } from "../types/configuration.js";
import type { AINodeCategory } from "../constants.js";

export class AINodeRegistry {
  private readonly nodes = new Map<string, AIWorkflowNodeDefinition>();

  register(definition: AIWorkflowNodeDefinition): this {
    if (this.nodes.has(definition.key)) {
      throw new Error(`AI workflow node already registered: ${definition.key}`);
    }
    this.nodes.set(definition.key, definition);
    return this;
  }

  get(key: string): AIWorkflowNodeDefinition {
    const node = this.nodes.get(key);
    if (!node) throw new Error(`Unknown AI workflow node: ${key}`);
    return node;
  }

  has(key: string): boolean {
    return this.nodes.has(key);
  }

  list(): AIWorkflowNodeDefinition[] {
    return [...this.nodes.values()];
  }

  listByCategory(category: AINodeCategory): AIWorkflowNodeDefinition[] {
    return this.list().filter((node) => node.category === category);
  }

  search(query: string): AIWorkflowNodeDefinition[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return this.list();
    return this.list().filter(
      (node) =>
        node.key.toLowerCase().includes(normalized) ||
        node.displayName.toLowerCase().includes(normalized) ||
        node.description.toLowerCase().includes(normalized),
    );
  }
}

export function createDefaultAINodeRegistry(): AINodeRegistry {
  return new AINodeRegistry();
}
