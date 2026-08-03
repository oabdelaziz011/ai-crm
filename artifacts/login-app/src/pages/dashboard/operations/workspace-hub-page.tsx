import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { activityEngine } from "@workspace/universal-workspace-platform";
import { WorkspaceWidgetsGrid } from "@/components/universal-workspace/workspace-widgets-grid";
import { WorkspaceActivityStream } from "@/components/universal-workspace/workspace-activity-stream";
import { WorkspaceAiAssistant } from "@/components/universal-workspace/workspace-ai-assistant";
import { useWorkspacePlatform } from "@/context/workspace-platform-context";

export function WorkspaceHubPage() {
  const { t } = useTranslation("common");
  const { snapshot } = useWorkspacePlatform();
  const [activitySearch, setActivitySearch] = useState("");

  const activityGroups = useMemo(
    () => activityEngine.groupByPeriod(activitySearch),
    [activitySearch],
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">{t("workspacePlatform.hub.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("workspacePlatform.hub.subtitle")}</p>
      </div>

      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t("workspacePlatform.hub.widgets")}
        </p>
        <WorkspaceWidgetsGrid widgets={snapshot?.widgets ?? []} />
      </section>

      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t("workspacePlatform.hub.activity")}
        </p>
        <WorkspaceActivityStream
          groups={activityGroups}
          search={activitySearch}
          onSearchChange={setActivitySearch}
        />
      </section>

      <WorkspaceAiAssistant />
    </div>
  );
}
