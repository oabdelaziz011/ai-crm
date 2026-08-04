import type { OperationsConfigTab } from "@workspace/universal-operations-engine";

export type OperationsConfigTabGroup = {
  id: string;
  labelKey: string;
  tabs: readonly OperationsConfigTab[];
};

/** Logical groupings for the configuration nav (product order, not technical dependency). */
export const OPERATIONS_CONFIG_TAB_GROUPS: readonly OperationsConfigTabGroup[] = [
  {
    id: "workspace",
    labelKey: "universalOperations.configuration.groups.workspace",
    tabs: ["general", "columns", "views"],
  },
  {
    id: "dailyOps",
    labelKey: "universalOperations.configuration.groups.dailyOps",
    tabs: ["statuses", "payment_status", "services", "resources"],
  },
  {
    id: "access",
    labelKey: "universalOperations.configuration.groups.access",
    tabs: ["permissions"],
  },
  {
    id: "communications",
    labelKey: "universalOperations.configuration.groups.communications",
    tabs: ["notifications", "integrations"],
  },
  {
    id: "automation",
    labelKey: "universalOperations.configuration.groups.automation",
    tabs: ["automation", "ai"],
  },
  {
    id: "advanced",
    labelKey: "universalOperations.configuration.groups.advanced",
    tabs: ["advanced"],
  },
] as const;

export function allGroupedConfigTabs(): OperationsConfigTab[] {
  return OPERATIONS_CONFIG_TAB_GROUPS.flatMap((group) => [...group.tabs]);
}
