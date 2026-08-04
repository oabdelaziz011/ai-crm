import type { OperationsConfigTab } from "@workspace/universal-operations-engine";
import {
  AdvancedConfigTab,
  AiConfigTab,
  AutomationConfigTab,
  DashboardConfigTab,
  IntegrationsConfigTab,
  NotificationsConfigTab,
  PermissionsConfigTab,
  ViewsConfigTab,
} from "./operations-config-platform-tabs";
import {
  ColumnsConfigTab,
  GeneralConfigTab,
  PaymentStatusConfigTab,
  ResourcesConfigTab,
  ServicesConfigTab,
  StatusesConfigTab,
} from "./operations-config-entity-tabs";
import type { ConfigAdvancedTabProps, ConfigTabEditorProps } from "./operations-config-tab-types";

type Props = ConfigTabEditorProps &
  Pick<ConfigAdvancedTabProps, "versions" | "onRollback" | "onCompareVersion" | "canPublish"> & {
    tab: OperationsConfigTab;
  };

export function OperationsConfigTabContent({
  tab,
  draft,
  updateDraft,
  readOnly,
  versions,
  onRollback,
  onCompareVersion,
  canPublish,
}: Props) {
  const props = { draft, updateDraft, readOnly };

  switch (tab) {
    case "general":
      return <GeneralConfigTab {...props} />;
    case "columns":
      return <ColumnsConfigTab {...props} />;
    case "statuses":
      return <StatusesConfigTab {...props} />;
    case "payment_status":
      return <PaymentStatusConfigTab {...props} />;
    case "services":
      return <ServicesConfigTab {...props} />;
    case "resources":
      return <ResourcesConfigTab {...props} />;
    case "automation":
      return <AutomationConfigTab {...props} />;
    case "permissions":
      return <PermissionsConfigTab {...props} />;
    case "views":
      return <ViewsConfigTab {...props} />;
    case "notifications":
      return <NotificationsConfigTab {...props} />;
    case "integrations":
      return <IntegrationsConfigTab {...props} />;
    case "ai":
      return <AiConfigTab {...props} />;
    case "advanced":
      return (
        <AdvancedConfigTab
          {...props}
          versions={versions ?? []}
          onRollback={onRollback ?? (() => {})}
          onCompareVersion={onCompareVersion}
          canPublish={canPublish}
        />
      );
    default:
      return null;
  }
}
