import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  WorkspaceInlineEmpty,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";

type Props = {
  tabLabelKey: string;
};

/** Shown when a deep-linked workspace tab is denied by entitlement or RBAC. */
export function WorkspaceTabAccessDenied({ tabLabelKey }: Props) {
  const { t } = useTranslation("common");

  return (
    <WorkspaceTabFrame title={t(tabLabelKey)}>
      <WorkspaceInlineEmpty
        icon={Lock}
        title={t("dashboard.customerWorkspace.accessDenied.title")}
        description={t("dashboard.customerWorkspace.accessDenied.body")}
      />
    </WorkspaceTabFrame>
  );
}
