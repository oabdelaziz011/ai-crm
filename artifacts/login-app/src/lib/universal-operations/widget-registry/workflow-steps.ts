import {
  registerDefaultWorkflows,
  resolveWorkflowEngine,
  type OperationsRow,
  type OperationsWorkspaceConfig,
  type WorkflowJourneyStageDefinition,
} from "@workspace/universal-operations-engine";

export type WorkflowStep = {
  id: string;
  labelKey: string;
  statusInternalNames: string[];
};

registerDefaultWorkflows({ includeExamples: true });

function toSteps(stages: WorkflowJourneyStageDefinition[]): WorkflowStep[] {
  return [...stages]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((stage) => ({
      id: stage.id,
      labelKey: stage.labelKey,
      statusInternalNames: stage.statusInternalNames,
    }));
}

function resolveStatusInternalName(
  row: OperationsRow,
  config: OperationsWorkspaceConfig | undefined,
): string | undefined {
  const fromConfig = config?.statuses.find((s) => s.id === row.statusId)?.internalName;
  if (fromConfig) return fromConfig;
  return row.statusId.replace(/^st_/, "");
}

/**
 * Resolve workflow strip from the registered Enterprise Workflow Engine for the template.
 * Operations UI never hardcodes industry statuses.
 */
export function resolveWorkflowState(
  row: OperationsRow,
  config: OperationsWorkspaceConfig | undefined,
  templateKey = "clinic",
): { steps: WorkflowStep[]; currentIndex: number; currentInternalName?: string } {
  const engine = resolveWorkflowEngine(templateKey);
  const currentInternalName = resolveStatusInternalName(row, config);

  if (engine) {
    const resolved = engine.resolveStage(currentInternalName);
    return {
      steps: toSteps(resolved.stages),
      currentIndex: resolved.currentIndex,
      currentInternalName: resolved.currentInternalName,
    };
  }

  return { steps: [], currentIndex: 0, currentInternalName };
}

/** @deprecated Prefer resolveWorkflowState(row, config, templateKey) — stages come from the workflow pack. */
export const DEFAULT_WORKFLOW_STEPS: WorkflowStep[] = toSteps(
  resolveWorkflowEngine("clinic")?.getDefinition().stages ?? [],
);
