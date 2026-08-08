import { useTranslation } from "react-i18next";
import type { OperationsConfigScreen } from "./operations-config-screens";
import {
  AdvancedConfigTab,
  AiConfigTab,
  AutomationConfigTab,
  IntegrationsConfigTab,
  NotificationsConfigTab,
  ViewsConfigTab,
} from "./operations-config-platform-tabs";
import { GeneralConfigTab } from "./operations-config-entity-tabs";
import {
  ColumnsManagementScreen,
  PaymentStatusesManagementScreen,
  PermissionsManagementScreen,
  ResourcesManagementScreen,
  ServicesManagementScreen,
  StatusesManagementScreen,
} from "./operations-config-management-screens";
import { OperationsConfigScreenShell } from "./operations-config-screen-shell";
import type { ConfigAdvancedTabProps, ConfigTabEditorProps } from "./operations-config-tab-types";

type Props = ConfigTabEditorProps &
  Pick<ConfigAdvancedTabProps, "versions" | "onRollback" | "onCompareVersion" | "canPublish"> & {
    screen: OperationsConfigScreen;
    onBack: () => void;
  };

function SecondarySettingsScreen({
  titleKey,
  descriptionKey,
  onBack,
  children,
}: {
  titleKey: string;
  descriptionKey: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation("common");
  return (
    <OperationsConfigScreenShell title={t(titleKey)} description={t(descriptionKey)} onBack={onBack}>
      {children}
    </OperationsConfigScreenShell>
  );
}

export function OperationsConfigScreenContent({
  screen,
  onBack,
  draft,
  updateDraft,
  readOnly,
  versions,
  onRollback,
  onCompareVersion,
  canPublish,
}: Props) {
  const shellProps = { draft, updateDraft, readOnly, onBack };

  switch (screen) {
    case "home":
      return null;
    case "columns":
      return <ColumnsManagementScreen {...shellProps} />;
    case "statuses":
      return <StatusesManagementScreen {...shellProps} />;
    case "services":
      return <ServicesManagementScreen {...shellProps} />;
    case "resources":
      return <ResourcesManagementScreen {...shellProps} />;
    case "permissions":
      return <PermissionsManagementScreen {...shellProps} />;
    case "payment_status":
      return <PaymentStatusesManagementScreen {...shellProps} />;
    case "general":
      return (
        <SecondarySettingsScreen titleKey="universalOperations.configuration.tabs.general" descriptionKey="universalOperations.configuration.tabDescriptions.general" onBack={onBack}>
          <GeneralConfigTab draft={draft} updateDraft={updateDraft} readOnly={readOnly} />
        </SecondarySettingsScreen>
      );
    case "views":
      return (
        <SecondarySettingsScreen titleKey="universalOperations.configuration.tabs.views" descriptionKey="universalOperations.configuration.tabDescriptions.views" onBack={onBack}>
          <ViewsConfigTab draft={draft} updateDraft={updateDraft} readOnly={readOnly} />
        </SecondarySettingsScreen>
      );
    case "notifications":
      return (
        <SecondarySettingsScreen titleKey="universalOperations.configuration.tabs.notifications" descriptionKey="universalOperations.configuration.tabDescriptions.notifications" onBack={onBack}>
          <NotificationsConfigTab draft={draft} updateDraft={updateDraft} readOnly={readOnly} />
        </SecondarySettingsScreen>
      );
    case "integrations":
      return (
        <SecondarySettingsScreen titleKey="universalOperations.configuration.tabs.integrations" descriptionKey="universalOperations.configuration.tabDescriptions.integrations" onBack={onBack}>
          <IntegrationsConfigTab draft={draft} updateDraft={updateDraft} readOnly={readOnly} />
        </SecondarySettingsScreen>
      );
    case "automation":
      return (
        <SecondarySettingsScreen titleKey="universalOperations.configuration.tabs.automation" descriptionKey="universalOperations.configuration.tabDescriptions.automation" onBack={onBack}>
          <AutomationConfigTab draft={draft} updateDraft={updateDraft} readOnly={readOnly} />
        </SecondarySettingsScreen>
      );
    case "ai":
      return (
        <SecondarySettingsScreen titleKey="universalOperations.configuration.tabs.ai" descriptionKey="universalOperations.configuration.tabDescriptions.ai" onBack={onBack}>
          <AiConfigTab draft={draft} updateDraft={updateDraft} readOnly={readOnly} />
        </SecondarySettingsScreen>
      );
    case "advanced":
      return (
        <SecondarySettingsScreen titleKey="universalOperations.configuration.tabs.advanced" descriptionKey="universalOperations.configuration.tabDescriptions.advanced" onBack={onBack}>
          <AdvancedConfigTab
            draft={draft}
            updateDraft={updateDraft}
            readOnly={readOnly}
            versions={versions ?? []}
            onRollback={onRollback ?? (() => {})}
            onCompareVersion={onCompareVersion}
            canPublish={canPublish}
          />
        </SecondarySettingsScreen>
      );
    default:
      return null;
  }
}
