import { useTranslation } from "react-i18next";
import { EntityAttachmentsPanel } from "@/components/entity-workspace/panels/entity-attachments-panel";
import { WorkspaceTabFrame } from "@/components/customer-workspace/workspace-tab-frame";

type Props = {
  customerId: string;
};

/** CRM Files tab — same shared Attachments service as Operations. */
export function WorkspaceFilesTab({ customerId }: Props) {
  const { t } = useTranslation("common");

  return (
    <WorkspaceTabFrame title={t("dashboard.customerWorkspace.tabs.files")}>
      <div className="bg-background p-3">
        <EntityAttachmentsPanel entityType="customer" entityId={customerId} />
      </div>
    </WorkspaceTabFrame>
  );
}
