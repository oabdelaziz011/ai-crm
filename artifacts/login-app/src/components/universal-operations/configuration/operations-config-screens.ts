/** Task-oriented screens for Operations Configuration (replaces abstract tab navigation). */
export type OperationsConfigScreen =
  | "home"
  | "columns"
  | "statuses"
  | "services"
  | "resources"
  | "permissions"
  | "payment_status"
  | "general"
  | "views"
  | "notifications"
  | "integrations"
  | "automation"
  | "ai"
  | "advanced";

export type OperationsConfigTask = {
  id: OperationsConfigScreen;
  labelKey: string;
  descriptionKey: string;
  actionKey: string;
  primary: boolean;
  /** When set, task navigates to live scheduling setup instead of workspace JSON editors. */
  externalHref?: string;
};

export const OPERATIONS_CONFIG_PRIMARY_TASKS: readonly OperationsConfigTask[] = [
  {
    id: "columns",
    labelKey: "universalOperations.configuration.tasks.manageColumns",
    descriptionKey: "universalOperations.configuration.tasks.manageColumnsDesc",
    actionKey: "universalOperations.configuration.tasks.addColumn",
    primary: true,
  },
  {
    id: "statuses",
    labelKey: "universalOperations.configuration.tasks.manageStatuses",
    descriptionKey: "universalOperations.configuration.tasks.manageStatusesDesc",
    actionKey: "universalOperations.configuration.tasks.addStatus",
    primary: true,
  },
  {
    id: "services",
    labelKey: "universalOperations.configuration.tasks.manageServices",
    descriptionKey: "universalOperations.configuration.tasks.manageServicesDesc",
    actionKey: "universalOperations.configuration.tasks.addService",
    primary: true,
    externalHref: "~/dashboard/settings/scheduling/services",
  },
  {
    id: "resources",
    labelKey: "universalOperations.configuration.tasks.manageResources",
    descriptionKey: "universalOperations.configuration.tasks.manageResourcesDesc",
    actionKey: "universalOperations.configuration.tasks.addResource",
    primary: true,
    externalHref: "~/dashboard/settings/scheduling/resources",
  },
  {
    id: "permissions",
    labelKey: "universalOperations.configuration.tasks.managePermissions",
    descriptionKey: "universalOperations.configuration.tasks.managePermissionsDesc",
    actionKey: "universalOperations.configuration.tasks.addPermission",
    primary: true,
  },
] as const;

export const OPERATIONS_CONFIG_SECONDARY_TASKS: readonly OperationsConfigTask[] = [
  {
    id: "payment_status",
    labelKey: "universalOperations.configuration.tabs.payment_status",
    descriptionKey: "universalOperations.configuration.tabDescriptions.payment_status",
    actionKey: "universalOperations.configuration.add",
    primary: false,
  },
  {
    id: "general",
    labelKey: "universalOperations.configuration.tabs.general",
    descriptionKey: "universalOperations.configuration.tabDescriptions.general",
    actionKey: "universalOperations.configuration.tasks.open",
    primary: false,
  },
  {
    id: "views",
    labelKey: "universalOperations.configuration.tabs.views",
    descriptionKey: "universalOperations.configuration.tabDescriptions.views",
    actionKey: "universalOperations.configuration.add",
    primary: false,
  },
  {
    id: "notifications",
    labelKey: "universalOperations.configuration.tabs.notifications",
    descriptionKey: "universalOperations.configuration.tabDescriptions.notifications",
    actionKey: "universalOperations.configuration.add",
    primary: false,
  },
  {
    id: "integrations",
    labelKey: "universalOperations.configuration.tabs.integrations",
    descriptionKey: "universalOperations.configuration.tabDescriptions.integrations",
    actionKey: "universalOperations.configuration.add",
    primary: false,
  },
  {
    id: "automation",
    labelKey: "universalOperations.configuration.tabs.automation",
    descriptionKey: "universalOperations.configuration.tabDescriptions.automation",
    actionKey: "universalOperations.configuration.add",
    primary: false,
  },
  {
    id: "ai",
    labelKey: "universalOperations.configuration.tabs.ai",
    descriptionKey: "universalOperations.configuration.tabDescriptions.ai",
    actionKey: "universalOperations.configuration.tasks.open",
    primary: false,
  },
  {
    id: "advanced",
    labelKey: "universalOperations.configuration.tabs.advanced",
    descriptionKey: "universalOperations.configuration.tabDescriptions.advanced",
    actionKey: "universalOperations.configuration.tasks.open",
    primary: false,
  },
] as const;

export function screenToLegacyTab(screen: OperationsConfigScreen): OperationsConfigScreen | null {
  if (screen === "home") return null;
  return screen;
}
