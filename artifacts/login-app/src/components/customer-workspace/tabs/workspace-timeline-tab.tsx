import { useTranslation } from "react-i18next";
import { CustomerTimelinePanel } from "@/lib/customer-timeline/components/customer-timeline";
import { WorkspaceTabFrame } from "@/components/customer-workspace/workspace-tab-frame";

type Props = {
  customerId: string;
  companyId?: string | null;
};

export function WorkspaceTimelineTab({ customerId, companyId }: Props) {
  const { t } = useTranslation("common");

  return (
    <WorkspaceTabFrame
      title={t("dashboard.customerWorkspace.tabs.activity")}
      subtitle={t("dashboard.customerWorkspace.timeline.subtitle")}
      className="min-h-0"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background p-3">
        <CustomerTimelinePanel
          customerId={customerId}
          companyId={companyId}
          cardVariant="workspace"
          fillHeight
        />
      </div>
    </WorkspaceTabFrame>
  );
}
