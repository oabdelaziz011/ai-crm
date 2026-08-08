import { ArrowLeftRight, Flag, UserPlus } from "lucide-react";
import type { OperationsActionDefinition } from "../types";
import { isStatusIn } from "../context-helpers";

export const assignmentActions: OperationsActionDefinition[] = [
  {
    id: "assignment.assign_user",
    titleKey: "universalOperations.actions.items.assignUser",
    icon: UserPlus,
    group: "assignment",
    order: 10,
    requiredPermissions: ["operations.write"],
    permissionMode: "disable",
    // Mutation exists but no employee picker dialog wired for queue — Coming Soon.
    comingSoon: true,
    dialog: "modal",
    surfaces: ["menu", "quickBar"],
    visible: (runtime) => !isStatusIn(runtime, ["completed", "archived"]),
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
  {
    id: "assignment.transfer",
    titleKey: "universalOperations.actions.items.transfer",
    icon: ArrowLeftRight,
    group: "assignment",
    order: 20,
    requiredPermissions: ["operations.write"],
    permissionMode: "disable",
    comingSoon: true,
    visible: (runtime) => !isStatusIn(runtime, ["completed", "archived"]),
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
  {
    id: "assignment.change_priority",
    titleKey: "universalOperations.actions.items.changePriority",
    icon: Flag,
    group: "assignment",
    order: 30,
    requiredPermissions: ["operations.write"],
    permissionMode: "disable",
    comingSoon: true,
    visible: (runtime) => !isStatusIn(runtime, ["archived"]),
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
];
