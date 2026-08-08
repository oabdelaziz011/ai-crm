import type { WorkflowDefinition } from "../../../workflow/types.js";

/**
 * EXAMPLE ONLY — demonstrates a second industry pack without changing the engine.
 * Not wired to Operations Queue mutations. Safe to register for extensibility proofs/tests.
 *
 * Construction: Planning → Assigned → In Progress → Completed
 */
export const WORKFLOW_PACK_CONSTRUCTION_EXAMPLE: WorkflowDefinition = {
  id: "construction_job_lifecycle",
  templateKey: "construction",
  labelKey: "universalOperations.workflows.construction.label",
  roleAliases: {
    manager: "manager",
    foreman: "foreman",
    worker: "worker",
  },
  states: [
    { id: "st_planning", internalName: "planning", displayName: "Planning", active: false },
    { id: "st_assigned", internalName: "assigned", displayName: "Assigned", active: true },
    { id: "st_in_progress", internalName: "in_progress", displayName: "In Progress", active: true },
    { id: "st_completed", internalName: "completed", displayName: "Completed", terminal: true },
  ],
  stages: [
    {
      id: "planning",
      labelKey: "universalOperations.workspace.workflow.planning",
      statusInternalNames: ["planning"],
      sortOrder: 0,
    },
    {
      id: "assigned",
      labelKey: "universalOperations.workspace.workflow.assigned",
      statusInternalNames: ["assigned"],
      sortOrder: 1,
    },
    {
      id: "in_progress",
      labelKey: "universalOperations.workspace.workflow.inProgress",
      statusInternalNames: ["in_progress"],
      sortOrder: 2,
    },
    {
      id: "completed",
      labelKey: "universalOperations.workspace.workflow.completed",
      statusInternalNames: ["completed"],
      sortOrder: 3,
    },
  ],
  kpiBuckets: {
    waiting: ["planning"],
    in_progress: ["assigned", "in_progress"],
    completed: ["completed"],
  },
  completionRules: {
    completedStates: ["completed"],
    archivedStates: [],
    terminalStates: ["completed"],
  },
  transitions: [
    {
      id: "construction.assign",
      from: ["planning"],
      to: "assigned",
      actionId: "construction.assign_crew",
      requiredPermissions: ["operations.write"],
      actorRoles: ["manager", "foreman"],
      timelineEvent: {
        type: "job_assigned",
        labelKey: "universalOperations.timeline.events.jobAssigned",
      },
      realtimeRefresh: true,
    },
    {
      id: "construction.start",
      from: ["assigned"],
      to: "in_progress",
      actionId: "construction.start_work",
      requiredPermissions: ["operations.write"],
      actorRoles: ["foreman", "worker", "manager"],
      timelineEvent: {
        type: "job_started",
        labelKey: "universalOperations.timeline.events.jobStarted",
      },
      realtimeRefresh: true,
    },
    {
      id: "construction.complete",
      from: ["in_progress"],
      to: "completed",
      actionId: "construction.complete_job",
      requiredPermissions: ["operations.write"],
      actorRoles: ["foreman", "manager"],
      timelineEvent: {
        type: "job_completed",
        labelKey: "universalOperations.timeline.events.jobCompleted",
      },
      realtimeRefresh: true,
    },
  ],
};
