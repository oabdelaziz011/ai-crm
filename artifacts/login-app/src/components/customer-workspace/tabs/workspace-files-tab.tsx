import { Download, Eye, FolderOpen, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WorkspaceEmptyState, WorkspacePanel } from "@/components/customer-workspace/workspace-ui";

export function WorkspaceFilesTab() {
  const { t } = useTranslation("common");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <WorkspacePanel
        title={t("dashboard.customerProfile.tabs.files")}
        action={
          <Button size="sm" variant="outline" className="gap-2" disabled>
            <Upload className="size-4" />
            {t("dashboard.customerWorkspace.files.upload")}
          </Button>
        }
      >
        <WorkspaceEmptyState
          icon={FolderOpen}
          title={t("dashboard.customerWorkspace.files.emptyTitle")}
          description={t("dashboard.customerProfile.placeholders.files")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" className="gap-2" disabled>
                <Upload className="size-4" />
                {t("dashboard.customerWorkspace.files.upload")}
              </Button>
              <Button size="sm" variant="ghost" className="gap-2" disabled>
                <Eye className="size-4" />
                {t("dashboard.customerWorkspace.files.preview")}
              </Button>
              <Button size="sm" variant="ghost" className="gap-2" disabled>
                <Download className="size-4" />
                {t("dashboard.customerWorkspace.files.download")}
              </Button>
            </div>
          }
        />
      </WorkspacePanel>
    </div>
  );
}
