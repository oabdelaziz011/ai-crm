import { ACTION_GROUP_LABEL_KEYS, ACTION_GROUP_ORDER } from "./groups";
import {
  hasActorRole,
  hasAnyPermission,
  isStatusIn,
  paymentInternalName,
  statusInternalName,
} from "./context-helpers";
import type {
  ActionGroupSection,
  OperationsActionDefinition,
  OperationsActionRuntime,
  ResolvedOperationsAction,
} from "./types";

export class OperationsActionRegistry {
  private readonly actions = new Map<string, OperationsActionDefinition>();

  register(action: OperationsActionDefinition): void {
    if (this.actions.has(action.id)) {
      throw new Error(`Action already registered: ${action.id}`);
    }
    this.actions.set(action.id, action);
  }

  registerMany(actions: OperationsActionDefinition[]): void {
    for (const action of actions) this.register(action);
  }

  get(id: string): OperationsActionDefinition | undefined {
    return this.actions.get(id);
  }

  list(): OperationsActionDefinition[] {
    return [...this.actions.values()];
  }

  /** Page asks only this — never hardcode action lists in UI. */
  getAvailableActions(runtime: OperationsActionRuntime): ResolvedOperationsAction[] {
    const resolved: ResolvedOperationsAction[] = [];
    const currentStatus = statusInternalName(runtime);
    const paymentStatus = paymentInternalName(runtime);
    const actorRole = runtime.actorRole ?? runtime.clinicRole;

    for (const action of this.actions.values()) {
      // Sprint Queue 2.0: never surface placeholder / coming-soon actions.
      if (action.comingSoon) continue;

      const workflowBound = Boolean(runtime.workflow?.isWorkflowBoundAction(action.id));
      const transition = workflowBound
        ? runtime.workflow!.findTransitionForAction(action.id, currentStatus, {
            actorRole,
            isSuperAdmin: runtime.isSuperAdmin,
            paymentStatus,
          })
        : undefined;

      if (workflowBound) {
        // Workflow decides availability — no Action Menu hardcoding of statuses/roles.
        if (!transition) continue;
        if (!action.visible(runtime)) continue;
      } else {
        if (action.supportedStatuses?.length && !isStatusIn(runtime, action.supportedStatuses)) {
          continue;
        }
        if (!action.visible(runtime)) continue;
      }

      const requiredPermissions = transition?.requiredPermissions ?? action.requiredPermissions;
      const roleGate = transition?.actorRoles ?? action.actorRoles ?? action.clinicRoles;
      const permitted =
        hasAnyPermission(runtime, requiredPermissions) && hasActorRole(runtime, roleGate);
      const permissionMode = action.permissionMode ?? "disable";
      if (!permitted && permissionMode === "hide") continue;

      let enabled = permitted && action.enabled(runtime) && runtime.commandsReady;
      let disabledReasonKey: string | undefined;

      if (!permitted) {
        enabled = false;
        disabledReasonKey = "universalOperations.actions.noPermission";
      } else if (!runtime.commandsReady) {
        enabled = false;
        disabledReasonKey = "universalOperations.actions.unavailable";
      } else if (!action.enabled(runtime)) {
        enabled = false;
        disabledReasonKey = "universalOperations.actions.unavailable";
      }

      const confirmation = transition?.confirmation ?? action.confirmation;

      resolved.push({
        id: action.id,
        titleKey: action.titleKey,
        title: action.titleKey,
        icon: action.icon,
        group: action.group,
        order: action.order,
        enabled,
        disabledReasonKey,
        destructive: action.destructive,
        confirmation,
        dialog: action.dialog ?? (confirmation ? "confirm" : "none"),
        comingSoon: action.comingSoon,
        surfaces: action.surfaces?.length ? action.surfaces : ["menu"],
      });
    }

    return resolved.sort((a, b) => {
      const groupDelta = ACTION_GROUP_ORDER.indexOf(a.group) - ACTION_GROUP_ORDER.indexOf(b.group);
      if (groupDelta !== 0) return groupDelta;
      return a.order - b.order;
    });
  }

  getQuickBarActions(runtime: OperationsActionRuntime): ResolvedOperationsAction[] {
    return this.getAvailableActions(runtime).filter((action) => action.surfaces.includes("quickBar"));
  }

  groupActions(actions: ResolvedOperationsAction[]): ActionGroupSection[] {
    const byGroup = new Map<string, ResolvedOperationsAction[]>();
    for (const action of actions) {
      const list = byGroup.get(action.group) ?? [];
      list.push(action);
      byGroup.set(action.group, list);
    }

    return ACTION_GROUP_ORDER
      .filter((group) => (byGroup.get(group)?.length ?? 0) > 0)
      .map((group) => ({
        group,
        labelKey: ACTION_GROUP_LABEL_KEYS[group],
        actions: byGroup.get(group) ?? [],
      }));
  }

  async execute(actionId: string, runtime: OperationsActionRuntime): Promise<void> {
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Unknown action: ${actionId}`);
    if (action.comingSoon) throw new Error("Coming soon");

    const currentStatus = statusInternalName(runtime);
    const paymentStatus = paymentInternalName(runtime);
    const actorRole = runtime.actorRole ?? runtime.clinicRole;
    const workflowBound = Boolean(runtime.workflow?.isWorkflowBoundAction(actionId));

    if (workflowBound) {
      const transition = runtime.workflow!.findTransitionForAction(actionId, currentStatus, {
        actorRole,
        isSuperAdmin: runtime.isSuperAdmin,
        paymentStatus,
      });
      if (!transition) throw new Error("Action unavailable");
      if (
        !hasAnyPermission(runtime, transition.requiredPermissions) ||
        !hasActorRole(runtime, transition.actorRoles)
      ) {
        throw new Error("No permission");
      }
      if (transition.to) {
        runtime.workflow!.assertTransition(transition.fromMatched, transition.to);
      }
    } else {
      if (!action.visible(runtime) || !action.enabled(runtime)) {
        throw new Error("Action unavailable");
      }
      if (
        !hasAnyPermission(runtime, action.requiredPermissions) ||
        !hasActorRole(runtime, action.actorRoles ?? action.clinicRoles)
      ) {
        throw new Error("No permission");
      }
    }

    if (!action.visible(runtime) || !action.enabled(runtime)) {
      throw new Error("Action unavailable");
    }

    await action.execute(runtime);
  }
}

export const operationsActionRegistry = new OperationsActionRegistry();
