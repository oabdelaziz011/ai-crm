import { registerEntityWorkspaceLayout } from "../layout-registry";
import { CRM_CUSTOMER_LAYOUT } from "./crm-customer-layout";
import {
  HR_ENTITY_LAYOUT,
  OPERATIONS_ENTITY_LAYOUT,
  SALES_ENTITY_LAYOUT,
  SUPPORT_ENTITY_LAYOUT,
} from "./operations-entity-layout";

let registered = false;

/** Idempotent registration of built-in module layouts. */
export function registerDefaultEntityWorkspaceLayouts(): void {
  if (registered) return;
  registerEntityWorkspaceLayout(CRM_CUSTOMER_LAYOUT);
  registerEntityWorkspaceLayout(OPERATIONS_ENTITY_LAYOUT);
  registerEntityWorkspaceLayout(SUPPORT_ENTITY_LAYOUT);
  registerEntityWorkspaceLayout(HR_ENTITY_LAYOUT);
  registerEntityWorkspaceLayout(SALES_ENTITY_LAYOUT);
  registered = true;
}
