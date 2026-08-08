import { UserRound, PanelRightOpen } from "lucide-react";
import type { OperationsActionDefinition } from "../types";
import { operationsEntityWorkspaceHref } from "@/lib/entity-workspace";

export const crmActions: OperationsActionDefinition[] = [
  {
    id: "crm.open_customer360",
    titleKey: "universalOperations.actions.items.openCustomer360",
    icon: PanelRightOpen,
    group: "general",
    order: 10,
    requiredPermissions: [],
    dialog: "none",
    toastOnSuccess: false,
    surfaces: ["menu", "quickBar"],
    visible: (runtime) => Boolean(runtime.row.customerId),
    enabled: (runtime) => Boolean(runtime.row.customerId),
    execute: (runtime) => {
      if (!runtime.row.customerId) return;
      runtime.navigate(
        operationsEntityWorkspaceHref(runtime.row.customerId, {
          operationId: runtime.row.id,
        }),
      );
    },
  },
  {
    id: "crm.view_customer",
    titleKey: "universalOperations.actions.items.viewCustomer",
    icon: UserRound,
    group: "general",
    order: 20,
    requiredPermissions: ["customers.view", "customer.read"],
    permissionMode: "disable",
    dialog: "none",
    toastOnSuccess: false,
    visible: (runtime) => Boolean(runtime.row.customerId),
    enabled: (runtime) => Boolean(runtime.row.customerId),
    execute: (runtime) => {
      if (!runtime.row.customerId) return;
      runtime.navigate(
        operationsEntityWorkspaceHref(runtime.row.customerId, {
          operationId: runtime.row.id,
        }),
      );
    },
  },
];
