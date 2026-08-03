import { useTranslation } from "react-i18next";
import { WorkspaceDesigner } from "@/components/universal-workspace/workspace-designer";

export function WorkspaceDesignerPage() {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{t("workspacePlatform.designer.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("workspacePlatform.designer.subtitle")}</p>
      </div>
      <WorkspaceDesigner />
    </div>
  );
}
