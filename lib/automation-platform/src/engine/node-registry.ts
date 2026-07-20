import type { AutomationNodeType } from "../constants.js";
import { AutomationNodeHandlerNotFoundError } from "../errors.js";
import { createBuiltInAutomationNodeHandlers } from "./built-in-nodes.js";
import type { AutomationNodeHandler } from "./execution-context.js";

export class AutomationNodeRegistry {
  private readonly handlers = new Map<AutomationNodeType, AutomationNodeHandler>();

  register(handler: AutomationNodeHandler): this {
    this.handlers.set(handler.type, handler);
    return this;
  }

  registerMany(handlers: AutomationNodeHandler[]): this {
    for (const handler of handlers) this.register(handler);
    return this;
  }

  get(type: AutomationNodeType): AutomationNodeHandler {
    const handler = this.handlers.get(type);
    if (!handler) throw new AutomationNodeHandlerNotFoundError(type);
    return handler;
  }

  has(type: AutomationNodeType): boolean {
    return this.handlers.has(type);
  }

  listTypes(): AutomationNodeType[] {
    return [...this.handlers.keys()];
  }
}

export function createDefaultAutomationNodeRegistry(): AutomationNodeRegistry {
  return new AutomationNodeRegistry().registerMany(createBuiltInAutomationNodeHandlers());
}
