import { Mail, MessageCircle, Phone } from "lucide-react";
import type { OperationsActionDefinition } from "../types";
import { rowPhone } from "../context-helpers";
import { operationsEntityWorkspaceHref } from "@/lib/entity-workspace";

export const communicationActions: OperationsActionDefinition[] = [
  {
    id: "communication.whatsapp",
    titleKey: "universalOperations.actions.items.whatsapp",
    icon: MessageCircle,
    group: "communication",
    order: 10,
    requiredPermissions: ["bookings.view", "ai.conversations.view"],
    permissionMode: "disable",
    toastOnSuccess: false,
    visible: (runtime) => Boolean(runtime.row.customerId),
    enabled: (runtime) => Boolean(runtime.row.customerId),
    execute: (runtime) => {
      if (!runtime.row.customerId) return;
      runtime.navigate(
        operationsEntityWorkspaceHref(runtime.row.customerId, {
          tab: "communication",
          operationId: runtime.row.id,
        }),
      );
    },
  },
  {
    id: "communication.sms",
    titleKey: "universalOperations.actions.items.sms",
    icon: MessageCircle,
    group: "communication",
    order: 20,
    requiredPermissions: ["notification.write"],
    permissionMode: "disable",
    comingSoon: true,
    visible: (runtime) => Boolean(rowPhone(runtime.row) || runtime.row.customerId),
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
  {
    id: "communication.email",
    titleKey: "universalOperations.actions.items.email",
    icon: Mail,
    group: "communication",
    order: 30,
    requiredPermissions: ["notification.write"],
    permissionMode: "disable",
    comingSoon: true,
    visible: (runtime) => Boolean(runtime.row.customerId),
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
  {
    id: "communication.call",
    titleKey: "universalOperations.actions.items.call",
    icon: Phone,
    group: "communication",
    order: 5,
    requiredPermissions: ["bookings.view", "customers.view"],
    permissionMode: "disable",
    toastOnSuccess: false,
    visible: (runtime) => Boolean(rowPhone(runtime.row) || runtime.row.customerId),
    enabled: (runtime) => Boolean(rowPhone(runtime.row) || runtime.row.customerId),
    execute: (runtime) => {
      const phone = rowPhone(runtime.row);
      if (phone) runtime.communication.call(phone);
      if (runtime.row.customerId) {
        runtime.navigate(
          operationsEntityWorkspaceHref(runtime.row.customerId, {
            operationId: runtime.row.id,
          }),
        );
      }
    },
  },
];
