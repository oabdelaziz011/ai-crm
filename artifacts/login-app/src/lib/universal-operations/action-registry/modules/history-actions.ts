import { Clock3, FileStack, ScrollText } from "lucide-react";
import type { OperationsActionDefinition } from "../types";
import { operationsEntityWorkspaceHref } from "@/lib/entity-workspace";

export const historyActions: OperationsActionDefinition[] = [
  {
    id: "history.timeline",
    titleKey: "universalOperations.actions.items.timeline",
    icon: Clock3,
    group: "history",
    order: 10,
    requiredPermissions: ["timeline.read", "operations.read"],
    permissionMode: "disable",
    dialog: "none",
    toastOnSuccess: false,
    visible: () => true,
    enabled: () => true,
    execute: (runtime) => {
      if (!runtime.row.customerId) return;
      runtime.navigate(
        operationsEntityWorkspaceHref(runtime.row.customerId, {
          tab: "timeline",
          operationId: runtime.row.id,
        }),
      );
    },
  },
  {
    id: "history.attachments",
    titleKey: "universalOperations.actions.items.attachments",
    icon: FileStack,
    group: "history",
    order: 20,
    requiredPermissions: ["entity.files.write", "operations.read"],
    permissionMode: "disable",
    comingSoon: true,
    visible: () => true,
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
  {
    id: "history.audit_log",
    titleKey: "universalOperations.actions.items.auditLog",
    icon: ScrollText,
    group: "history",
    order: 30,
    requiredPermissions: ["operations.read"],
    permissionMode: "disable",
    comingSoon: true,
    visible: () => true,
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
];
