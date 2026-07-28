import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CollapsibleSidebar } from "../layout/collapsible-sidebar";
import { VersionHistoryPanel } from "../lifecycle/version-history-panel";
import { PROPERTIES_WIDTH_PX, usePropertiesCollapsed } from "../../hooks/use-properties-collapsed";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import type { WorkflowDocument } from "../../core/types";
import type { WorkflowRepository } from "../../core/persistence/workflow-repository";
import type { ServiceContext } from "@workspace/automation-platform";
import { WorkflowValidationPanel } from "../validation/workflow-validation-panel";
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
  const { collapsed, setCollapsed, toggle } = usePropertiesCollapsed();

  useEffect(() => {
    if (controller.state.validationPanelFocusNonce === 0) return;
    if (collapsed) setCollapsed(false);
  }, [collapsed, controller.state.validationPanelFocusNonce, setCollapsed]);

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
        <div className="shrink-0">
          <PropertiesPanel />
        </div>
        <WorkflowValidationPanel controller={controller} />
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
