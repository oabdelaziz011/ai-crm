import { appointmentActions } from "./modules/appointment-actions";
import { assignmentActions } from "./modules/assignment-actions";
import { aiActions } from "./modules/ai-actions";
import { billingActions } from "./modules/billing-actions";
import { communicationActions } from "./modules/communication-actions";
import { crmActions } from "./modules/crm-actions";
import { historyActions } from "./modules/history-actions";
import { operationsActionRegistry } from "./registry";

let registered = false;

/** Idempotent bootstrap — modules register into the shared application registry. */
export function registerDefaultOperationsActions(): typeof operationsActionRegistry {
  if (!registered) {
    operationsActionRegistry.registerMany([
      ...crmActions,
      ...appointmentActions,
      ...billingActions,
      ...communicationActions,
      ...assignmentActions,
      ...aiActions,
      ...historyActions,
    ]);
    registered = true;
  }
  return operationsActionRegistry;
}

export function getOperationsActionRegistry() {
  return registerDefaultOperationsActions();
}
