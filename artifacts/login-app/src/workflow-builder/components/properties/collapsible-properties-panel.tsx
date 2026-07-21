import { useTranslation } from "react-i18next";
import { CollapsibleSidebar } from "../layout/collapsible-sidebar";
import { VersionHistoryPanel } from "../lifecycle/version-history-panel";
import { PROPERTIES_WIDTH_PX, usePropertiesCollapsed } from "../../hooks/use-properties-collapsed";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import type { WorkflowDocument } from "../../core/types";
import type { WorkflowRepository } from "../../core/persistence/workflow-repository";
import type { ServiceContext } from "@workspace/automation-platform";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import { PropertiesPanel } from "./properties-panel";

type CollapsiblePropertiesPanelProps = {
  controller: WorkflowBuilderController;
  document: WorkflowDocument;
  repository: WorkflowRepository;
  context: ServiceContext;
  canRollback: boolean;
  onRollback: (versionNumber: number) => Promise<void>;
};

export function CollapsiblePropertiesPanel({
  controller,
  document,
  repository,
  context,
  canRollback,
  onRollback,
}: CollapsiblePropertiesPanelProps) {
  const { t } = useTranslation("common");
  const { validationMessage } = useWorkflowBuilderI18n();
  const { collapsed, toggle } = usePropertiesCollapsed();

  return (
    <CollapsibleSidebar
      panelId="workflow-builder-properties-panel"
      widthPx={PROPERTIES_WIDTH_PX}
      collapsed={collapsed}
      onToggle={toggle}
      edge="leading"
      collapseLabel={t("workflowBuilder.properties.collapse")}
      expandLabel={t("workflowBuilder.properties.expand")}
    >
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
        <PropertiesPanel controller={controller} />
        {controller.state.validationIssues.length > 0 ? (
          <div className="shrink-0 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {t("workflowBuilder.validation.title")}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {controller.state.validationIssues.slice(0, 4).map((issue) => (
                <li key={issue.id}>• {validationMessage(issue)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="hidden min-h-0 shrink-0 2xl:block">
          <VersionHistoryPanel
            flowId={document.flowId}
            repository={repository}
            context={context}
            canRollback={canRollback}
            onRollback={onRollback}
          />
        </div>
      </div>
    </CollapsibleSidebar>
  );
}
