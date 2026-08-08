/**
 * Enterprise Workflow Engine — industry-agnostic workflow definitions.
 * Industry packs (clinic, construction, …) register definitions; the engine enforces policy.
 */

/** Actor role used by transition permission matrices (not UI role widgets). */
export type WorkflowActorRole = string;

export type WorkflowStateDefinition = {
  /** Stable id aligned with OperationsWorkspaceConfig status ids when applicable. */
  id: string;
  /** Canonical status key used by transitions / Action Registry / booking domain. */
  internalName: string;
  displayName: string;
  /** Terminal = no outbound workflow transitions (except explicit archive edges). */
  terminal?: boolean;
  /** Counts toward active / in-progress capacity KPIs. */
  active?: boolean;
};

export type WorkflowTimelineEventSpec = {
  /** Event type key for timeline providers / analytics. */
  type: string;
  /** i18n label key for human-readable timeline copy. */
  labelKey: string;
};

export type WorkflowConfirmationSpec = {
  titleKey: string;
  descriptionKey: string;
};

/**
 * Declares when an Action Registry action is available and what it changes.
 * Mutations stay in Action Registry execute handlers — the workflow only decides availability.
 */
export type WorkflowTransitionDefinition = {
  id: string;
  /** Current state internalNames (any match). */
  from: string[];
  /** Next state internalName after success (omit for side-effects that don't change status). */
  to?: string;
  /**
   * Action Registry action id.
   * Omit for domain-only edges (validity graph) that are not exposed in the Action Menu.
   */
  actionId?: string;
  requiredPermissions: string[];
  /** When set, actor must match one of these (manager bypass is applied by consumers). */
  actorRoles?: WorkflowActorRole[];
  confirmation?: WorkflowConfirmationSpec;
  timelineEvent: WorkflowTimelineEventSpec;
  /** When true, successful execution should invalidate queue/KPI/C360/realtime queries. */
  realtimeRefresh: boolean;
  /**
   * Optional payment gates (billing transitions).
   * When set, current payment internalName must be in the list.
   */
  paymentStatuses?: string[];
};

/** Journey strip stage (distinct from intelligence WorkflowStageDefinition). */
export type WorkflowJourneyStageDefinition = {
  id: string;
  labelKey: string;
  statusInternalNames: string[];
  sortOrder: number;
};

export type WorkflowCompletionRules = {
  /** States that mean the operation is finished (before optional archive). */
  completedStates: string[];
  /** States that mean archived / view-only. */
  archivedStates: string[];
  /** States with no outbound transitions. */
  terminalStates: string[];
};

export type WorkflowDefinition = {
  id: string;
  /** Matches Operations templateKey (clinic, construction, …). */
  templateKey: string;
  labelKey: string;
  states: WorkflowStateDefinition[];
  transitions: WorkflowTransitionDefinition[];
  stages: WorkflowJourneyStageDefinition[];
  /** KPI metricKey → status internalNames counted for that metric. */
  kpiBuckets: Record<string, string[]>;
  completionRules: WorkflowCompletionRules;
  /**
   * Maps UI / Customer360 preview roles onto WorkflowActorRole values.
   * Example: receptionist → reception, cashier → accountant.
   */
  roleAliases?: Record<string, WorkflowActorRole>;
};

export type ResolvedWorkflowTransition = WorkflowTransitionDefinition & {
  fromMatched: string;
};
