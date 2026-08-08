import type { OperationsActionDefinition } from "./types";
import { getOperationsActionRegistry } from "./register-default-actions";

export type {
  ActionDialogKind,
  ActionGroupId,
  ActionGroupSection,
  ActionPermissionMode,
  ActionSurface,
  ClinicActingRole,
  OperationsActionCommands,
  OperationsActionDefinition,
  OperationsActionRuntime,
  ResolvedOperationsAction,
} from "./types";
export { ACTION_GROUP_LABEL_KEYS, ACTION_GROUP_ORDER } from "./groups";
export { OperationsActionRegistry, operationsActionRegistry } from "./registry";
export { getOperationsActionRegistry, registerDefaultOperationsActions } from "./register-default-actions";
export {
  featureFlagsFromConfig,
  hasActorRole,
  hasAnyPermission,
  hasClinicRole,
  isBillingEnabled,
  isPaymentIn,
  isStatusIn,
  paymentInternalName,
  rowAmountCents,
  rowPhone,
  statusInternalName,
} from "./context-helpers";

/** Allow other modules to extend the shared Action Registry at runtime. */
export function registerOperationsModuleActions(actions: OperationsActionDefinition[]): void {
  getOperationsActionRegistry().registerMany(actions);
}
