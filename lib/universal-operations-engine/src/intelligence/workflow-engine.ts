import type { WorkflowStageDefinition, WorkflowStageState } from "../types/intelligence-types.js";

const CLINIC_WORKFLOW: WorkflowStageDefinition[] = [
  { id: "booked", labelKey: "workflow.booked", sortOrder: 0 },
  { id: "confirmed", labelKey: "workflow.confirmed", sortOrder: 1 },
  { id: "checked_in", labelKey: "workflow.checkedIn", sortOrder: 2 },
  { id: "doctor", labelKey: "workflow.doctor", sortOrder: 3 },
  { id: "cashier", labelKey: "workflow.cashier", sortOrder: 4 },
  { id: "completed", labelKey: "workflow.completed", sortOrder: 5 },
];

const WORKFLOW_LABELS: Record<string, string> = {
  "workflow.booked": "Booked",
  "workflow.confirmed": "Confirmed",
  "workflow.checkedIn": "Checked In",
  "workflow.doctor": "Doctor",
  "workflow.cashier": "Cashier",
  "workflow.completed": "Completed",
};

export class WorkflowEngine {
  private readonly stages: WorkflowStageDefinition[];

  constructor(stages: WorkflowStageDefinition[] = CLINIC_WORKFLOW) {
    this.stages = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  buildTracker(currentStageId: string): WorkflowStageState[] {
    let passedActive = false;
    return this.stages.map((stage) => {
      if (stage.id === currentStageId) {
        passedActive = true;
        return { id: stage.id, label: WORKFLOW_LABELS[stage.labelKey] ?? stage.id, state: "active" as const };
      }
      if (!passedActive) {
        return { id: stage.id, label: WORKFLOW_LABELS[stage.labelKey] ?? stage.id, state: "done" as const };
      }
      return { id: stage.id, label: WORKFLOW_LABELS[stage.labelKey] ?? stage.id, state: "pending" as const };
    });
  }

  resolveCurrentStageFromStatus(status: string): string {
    const normalized = status.toLowerCase().replace(/\s+/g, "_");
    if (normalized.includes("check")) return "checked_in";
    if (normalized.includes("progress") || normalized.includes("doctor")) return "doctor";
    if (normalized.includes("complete")) return "completed";
    if (normalized.includes("confirm")) return "confirmed";
    return "checked_in";
  }
}

export const workflowEngine = new WorkflowEngine();
