import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  LayoutTemplate,
  Redo2,
  Save,
  Undo2,
  UploadCloud,
  FlaskConical,
  TestTube2,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AlignmentMode } from "../../core/layout/alignment";
import { PublishDialog } from "../lifecycle/publish-dialog";
import { WorkflowStatusBadge } from "../lifecycle/workflow-status-badge";
import { ValidationSummary } from "../validation/validation-summary";
import { BuilderStatusBar } from "../status/builder-status-bar";
import { usePermissions } from "@/hooks/use-rbac";
import {
  useBuilderActions,
  useDocumentBuilderSlice,
  useHistoryBuilderSlice,
  useValidationBuilderSlice,
} from "../../context/workflow-builder-context";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import type { WorkflowSimulationController } from "../../simulation/hooks/use-workflow-simulation";
import type { WorkflowTestingController } from "../../testing/hooks/use-workflow-testing";
import type { WorkflowAnalyticsController } from "../../analytics/hooks/use-workflow-analytics";

export const BuilderToolbar = memo(function BuilderToolbar({
  onBack,
  controller,
  simulation,
  testing,
  analytics,
}: {
  onBack: () => void;
  controller: WorkflowBuilderController;
  simulation?: WorkflowSimulationController | null;
  testing?: WorkflowTestingController | null;
  analytics?: WorkflowAnalyticsController | null;
}) {
  const { t } = useTranslation("common");
  const { hasPermission } = usePermissions();
  const [publishOpen, setPublishOpen] = useState(false);
  const { document: workflowDocument } = useDocumentBuilderSlice();
  const { validationIssues } = useValidationBuilderSlice();
  const { canUndo, canRedo, saveStatus, hasUnsavedChanges } = useHistoryBuilderSlice();
  const { alignSelected, applyAutoLayout, persist, publish, undo, redo, openValidationPanel, setMetadata } =
    useBuilderActions();

  const align = (mode: AlignmentMode) => {
    alignSelected(mode);
  };

  const focusWorkflowCanvas = () => {
    const pane = globalThis.document.querySelector<HTMLElement>(".react-flow__pane");
    if (!pane) return;
    pane.tabIndex = -1;
    pane.focus({ preventScroll: true });
  };

  const canPublish = hasPermission("automation.publish");

  return (
    <>
      <div className="relative flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card/90 px-4 py-3 shadow-lg backdrop-blur">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="rounded-xl">
          <ArrowLeft className="me-2 h-4 w-4" />
          {t("workflowBuilder.actions.back")}
        </Button>
        <Input
          value={workflowDocument.name}
          onChange={(event) => setMetadata({ name: event.target.value })}
          className="max-w-sm rounded-xl border-border/60 bg-background/80"
          aria-label={t("workflowBuilder.fields.workflowName")}
          disabled={workflowDocument.readOnly}
        />
        <WorkflowStatusBadge status={workflowDocument.status} hasUnpublishedDraft={workflowDocument.hasUnpublishedDraft} />
        <ValidationSummary issues={validationIssues} onOpenPanel={() => openValidationPanel()} />
        <BuilderStatusBar
          saveStatus={saveStatus}
          documentStatus={workflowDocument.status}
          hasUnpublishedDraft={workflowDocument.hasUnpublishedDraft}
        />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="rounded-xl">
                <AlignCenterHorizontal className="me-2 h-4 w-4" />
                {t("workflowBuilder.actions.align")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="rounded-xl"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                focusWorkflowCanvas();
              }}
            >
              <DropdownMenuItem onSelect={() => align("left")}><AlignLeft className="me-2 h-4 w-4" />{t("workflowBuilder.align.left")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => align("right")}><AlignRight className="me-2 h-4 w-4" />{t("workflowBuilder.align.right")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => align("top")}><ArrowUp className="me-2 h-4 w-4" />{t("workflowBuilder.align.top")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => align("bottom")}><ArrowDown className="me-2 h-4 w-4" />{t("workflowBuilder.align.bottom")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => align("center-horizontal")}><AlignCenterHorizontal className="me-2 h-4 w-4" />{t("workflowBuilder.align.centerHorizontal")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => align("center-vertical")}><AlignCenterVertical className="me-2 h-4 w-4" />{t("workflowBuilder.align.centerVertical")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => align("distribute-horizontal")}><AlignHorizontalDistributeCenter className="me-2 h-4 w-4" />{t("workflowBuilder.align.distributeHorizontal")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => align("distribute-vertical")}><AlignHorizontalDistributeCenter className="me-2 h-4 w-4 rotate-90" />{t("workflowBuilder.align.distributeVertical")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={applyAutoLayout}>
            <LayoutTemplate className="me-2 h-4 w-4" />
            {t("workflowBuilder.actions.autoLayout")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!canUndo} onClick={undo} className="rounded-xl" aria-label={t("workflowBuilder.actions.undo")}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!canRedo} onClick={redo} className="rounded-xl" aria-label={t("workflowBuilder.actions.redo")}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void persist()} className="rounded-xl">
            <Save className="me-2 h-4 w-4" />
            {t("workflowBuilder.actions.saveDraft")}
          </Button>
          {simulation ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                simulation.setPanelOpen(true);
                if (simulation.snapshot.status === "idle" || simulation.snapshot.status === "stopped") {
                  simulation.start({ autoAdvance: true });
                }
              }}
            >
              <FlaskConical className="me-2 h-4 w-4" />
              {t("workflowBuilder.simulation.actions.simulate")}
            </Button>
          ) : null}
          {testing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => testing.setPanelOpen(true)}
            >
              <TestTube2 className="me-2 h-4 w-4" />
              {t("workflowBuilder.testing.actions.test")}
            </Button>
          ) : null}
          {analytics ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => analytics.setPanelOpen(true)}
            >
              <BarChart3 className="me-2 h-4 w-4" />
              {t("workflowBuilder.analytics.actions.open")}
            </Button>
          ) : null}
          {canPublish ? (
            <Button type="button" size="sm" className="rounded-xl" onClick={() => setPublishOpen(true)}>
              <UploadCloud className="me-2 h-4 w-4" />
              {t("workflowBuilder.actions.publish")}
            </Button>
          ) : null}
        </div>
      </div>
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        controller={controller}
        onPublish={async (releaseNotes) => {
          await publish(releaseNotes);
        }}
      />
    </>
  );
});
