import { WORKFLOW_PACK_CLINIC } from "../config/seed/workflow-packs/clinic-workflow.js";
import { WORKFLOW_PACK_CONSTRUCTION_EXAMPLE } from "../config/seed/workflow-packs/construction-workflow.example.js";
import { workflowRegistry } from "./workflow-registry.js";

let registered = false;

/**
 * Registers built-in industry packs once.
 * Clinic is production; Construction is an example pack proving engine extensibility.
 */
export function registerDefaultWorkflows(options?: { includeExamples?: boolean }): void {
  if (registered) return;
  if (!workflowRegistry.hasTemplate(WORKFLOW_PACK_CLINIC.templateKey)) {
    workflowRegistry.register(WORKFLOW_PACK_CLINIC);
  }
  if (options?.includeExamples !== false) {
    if (!workflowRegistry.hasTemplate(WORKFLOW_PACK_CONSTRUCTION_EXAMPLE.templateKey)) {
      workflowRegistry.register(WORKFLOW_PACK_CONSTRUCTION_EXAMPLE);
    }
  }
  registered = true;
}

/** Test helper — clears singleton registry between isolated tests. */
export function resetWorkflowRegistryForTests(): void {
  workflowRegistry.clear();
  registered = false;
}
