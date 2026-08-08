import { EnterpriseWorkflowEngine } from "./enterprise-workflow-engine.js";
import type { WorkflowDefinition } from "./types.js";

/**
 * Global registry of industry workflow definitions.
 * Register once at bootstrap; resolve by templateKey / id at runtime.
 */
export class WorkflowRegistry {
  private readonly byId = new Map<string, WorkflowDefinition>();
  private readonly byTemplate = new Map<string, WorkflowDefinition>();

  register(definition: WorkflowDefinition): void {
    if (this.byId.has(definition.id)) {
      throw new Error(`Workflow already registered: ${definition.id}`);
    }
    this.byId.set(definition.id, definition);
    this.byTemplate.set(definition.templateKey, definition);
  }

  registerMany(definitions: WorkflowDefinition[]): void {
    for (const definition of definitions) this.register(definition);
  }

  getById(id: string): WorkflowDefinition | undefined {
    return this.byId.get(id);
  }

  getByTemplateKey(templateKey: string): WorkflowDefinition | undefined {
    return this.byTemplate.get(templateKey);
  }

  list(): WorkflowDefinition[] {
    return [...this.byId.values()];
  }

  hasTemplate(templateKey: string): boolean {
    return this.byTemplate.has(templateKey);
  }

  clear(): void {
    this.byId.clear();
    this.byTemplate.clear();
  }

  createEngine(templateKey: string): EnterpriseWorkflowEngine | undefined {
    const definition = this.getByTemplateKey(templateKey);
    if (!definition) return undefined;
    return new EnterpriseWorkflowEngine(definition);
  }

  /** Require a workflow for a template — throws if missing. */
  requireEngine(templateKey: string): EnterpriseWorkflowEngine {
    const engine = this.createEngine(templateKey);
    if (!engine) {
      throw new Error(`No workflow registered for template: ${templateKey}`);
    }
    return engine;
  }
}

/** Process-wide default registry (clinic + example packs register here). */
export const workflowRegistry = new WorkflowRegistry();

export function registerWorkflow(definition: WorkflowDefinition): void {
  workflowRegistry.register(definition);
}

export function resolveWorkflowEngine(templateKey: string): EnterpriseWorkflowEngine | undefined {
  return workflowRegistry.createEngine(templateKey);
}
