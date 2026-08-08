import type {
  ResolvedWorkflowTransition,
  WorkflowActorRole,
  WorkflowDefinition,
  WorkflowJourneyStageDefinition,
  WorkflowTransitionDefinition,
} from "./types.js";

/**
 * Pure policy engine for a single registered workflow definition.
 * Does not execute mutations — Action Registry owns execute; this owns availability & validity.
 */
export class EnterpriseWorkflowEngine {
  private readonly byActionId = new Map<string, WorkflowTransitionDefinition[]>();
  private readonly stateByInternalName = new Map<string, WorkflowDefinition["states"][number]>();
  private readonly outbound = new Map<string, Set<string>>();

  constructor(private readonly definition: WorkflowDefinition) {
    for (const state of definition.states) {
      this.stateByInternalName.set(state.internalName, state);
    }
    for (const transition of definition.transitions) {
      if (transition.actionId) {
        const list = this.byActionId.get(transition.actionId) ?? [];
        list.push(transition);
        this.byActionId.set(transition.actionId, list);
      }

      if (transition.to) {
        for (const from of transition.from) {
          const set = this.outbound.get(from) ?? new Set<string>();
          set.add(transition.to);
          this.outbound.set(from, set);
        }
      }
    }
  }

  getDefinition(): WorkflowDefinition {
    return this.definition;
  }

  getTemplateKey(): string {
    return this.definition.templateKey;
  }

  /** Action ids that are governed by this workflow (availability decided here). */
  isWorkflowBoundAction(actionId: string): boolean {
    return this.byActionId.has(actionId);
  }

  getBoundActionIds(): string[] {
    return [...this.byActionId.keys()];
  }

  resolveActorRole(workspaceRole?: string): WorkflowActorRole | undefined {
    if (!workspaceRole) return undefined;
    const aliases = this.definition.roleAliases ?? {};
    return aliases[workspaceRole] ?? workspaceRole;
  }

  canTransition(from: string, to: string): boolean {
    return this.outbound.get(from)?.has(to) ?? false;
  }

  assertTransition(from: string, to: string): void {
    if (!this.canTransition(from, to)) {
      throw new Error(`INVALID_STATUS_TRANSITION:${from}->${to}`);
    }
  }

  allowedNext(from: string): string[] {
    return [...(this.outbound.get(from) ?? [])];
  }

  isTerminal(status: string): boolean {
    const state = this.stateByInternalName.get(status);
    if (state?.terminal) return true;
    return this.definition.completionRules.terminalStates.includes(status);
  }

  isActive(status: string): boolean {
    return this.stateByInternalName.get(status)?.active === true;
  }

  isArchived(status: string): boolean {
    return this.definition.completionRules.archivedStates.includes(status);
  }

  /**
   * Build ALLOWED_TRANSITIONS map for domain lifecycle services.
   * Keys/values are status internalNames that appear on transition edges.
   */
  buildAllowedTransitionMap(): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const state of this.definition.states) {
      map[state.internalName] = this.allowedNext(state.internalName);
    }
    // Ensure every from-status seen on transitions exists even if not in states list.
    for (const [from, targets] of this.outbound) {
      if (!map[from]) map[from] = [...targets];
    }
    return map;
  }

  resolveStage(statusInternalName: string | undefined): {
    stages: WorkflowJourneyStageDefinition[];
    currentIndex: number;
    currentInternalName?: string;
  } {
    const stages = [...this.definition.stages].sort((a, b) => a.sortOrder - b.sortOrder);
    const currentIndex = stages.findIndex((stage) =>
      statusInternalName ? stage.statusInternalNames.includes(statusInternalName) : false,
    );
    return {
      stages,
      currentIndex: currentIndex < 0 ? 0 : currentIndex,
      currentInternalName: statusInternalName,
    };
  }

  kpiStatusInternalNames(metricKey: string): string[] {
    return this.definition.kpiBuckets[metricKey] ?? [];
  }

  timelineMarkers(): Array<{ type: string; labelKey: string; whenStatusIn: string[] }> {
    const byType = new Map<string, { type: string; labelKey: string; whenStatusIn: Set<string> }>();
    for (const transition of this.definition.transitions) {
      if (!transition.to) continue;
      const key = transition.timelineEvent.type;
      const existing = byType.get(key) ?? {
        type: key,
        labelKey: transition.timelineEvent.labelKey,
        whenStatusIn: new Set<string>(),
      };
      existing.whenStatusIn.add(transition.to);
      byType.set(key, existing);
    }
    return [...byType.values()].map((m) => ({
      type: m.type,
      labelKey: m.labelKey,
      whenStatusIn: [...m.whenStatusIn],
    }));
  }

  findTransitionForAction(
    actionId: string,
    currentStatus: string | undefined,
    options?: {
      actorRole?: WorkflowActorRole;
      isSuperAdmin?: boolean;
      paymentStatus?: string;
    },
  ): ResolvedWorkflowTransition | undefined {
    if (!currentStatus) return undefined;
    const candidates = this.byActionId.get(actionId) ?? [];
    for (const transition of candidates) {
      if (!transition.from.includes(currentStatus)) continue;
      if (transition.paymentStatuses?.length) {
        if (!options?.paymentStatus || !transition.paymentStatuses.includes(options.paymentStatus)) {
          continue;
        }
      }
      if (!this.roleAllowed(transition, options?.actorRole, options?.isSuperAdmin)) continue;
      return { ...transition, fromMatched: currentStatus };
    }
    return undefined;
  }

  listAvailableTransitions(
    currentStatus: string | undefined,
    options?: {
      actorRole?: WorkflowActorRole;
      isSuperAdmin?: boolean;
      paymentStatus?: string;
      /** When false, skip role filtering (permission codes still applied by Action Registry). */
      enforceRoles?: boolean;
    },
  ): ResolvedWorkflowTransition[] {
    if (!currentStatus) return [];
    const enforceRoles = options?.enforceRoles !== false;
    const out: ResolvedWorkflowTransition[] = [];
    for (const transition of this.definition.transitions) {
      if (!transition.from.includes(currentStatus)) continue;
      if (transition.paymentStatuses?.length) {
        if (!options?.paymentStatus || !transition.paymentStatuses.includes(options.paymentStatus)) {
          continue;
        }
      }
      if (enforceRoles && !this.roleAllowed(transition, options?.actorRole, options?.isSuperAdmin)) {
        continue;
      }
      out.push({ ...transition, fromMatched: currentStatus });
    }
    return out;
  }

  private roleAllowed(
    transition: WorkflowTransitionDefinition,
    actorRole: WorkflowActorRole | undefined,
    isSuperAdmin?: boolean,
  ): boolean {
    if (!transition.actorRoles?.length) return true;
    if (isSuperAdmin) return true;
    if (!actorRole) return true; // no role context → permission codes decide
    if (actorRole === "manager") return true;
    return transition.actorRoles.includes(actorRole);
  }
}
