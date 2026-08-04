import type { WorkflowStageDefinition, WorkflowStageState } from "../types/intelligence-types.js";
import { OperationsRuntimeConfigurationError } from "../runtime/runtime-configuration-error.js";

export class WorkflowEngine {
  private readonly stages: WorkflowStageDefinition[];

  constructor(stages: WorkflowStageDefinition[]) {
    if (!stages.length) {
      throw new OperationsRuntimeConfigurationError(
        "configuration.intelligence.workflowStages is required — no runtime workflow fallback available",
      );
    }
    this.stages = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  buildTracker(currentStageId: string): WorkflowStageState[] {
    let passedActive = false;
    return this.stages.map((stage) => {
      const label = stage.labelKey;
      if (stage.id === currentStageId) {
        passedActive = true;
        return { id: stage.id, label, state: "active" as const };
      }
      if (!passedActive) {
        return { id: stage.id, label, state: "done" as const };
      }
      return { id: stage.id, label, state: "pending" as const };
    });
  }

  resolveCurrentStageFromStatus(status: string): string {
    const normalized = status.toLowerCase().replace(/\s+/g, "_");
    const match = this.stages.find((stage) => normalized.includes(stage.id.replace(/_/g, "")));
    if (match) return match.id;
    const byLabel = this.stages.find((stage) => normalized.includes(stage.labelKey.toLowerCase()));
    if (byLabel) return byLabel.id;
    return this.stages[0]!.id;
  }
}
