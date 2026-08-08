import { Lightbulb, Sparkles } from "lucide-react";
import type { OperationsActionDefinition } from "../types";

export const aiActions: OperationsActionDefinition[] = [
  {
    id: "ai.summarize",
    titleKey: "universalOperations.actions.items.summarize",
    icon: Sparkles,
    group: "ai",
    order: 10,
    requiredPermissions: ["ai.write"],
    permissionMode: "disable",
    comingSoon: true,
    visible: () => true,
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
  {
    id: "ai.suggested_next_step",
    titleKey: "universalOperations.actions.items.suggestedNextStep",
    icon: Lightbulb,
    group: "ai",
    order: 20,
    requiredPermissions: ["ai.write"],
    permissionMode: "disable",
    comingSoon: true,
    visible: () => true,
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
];
