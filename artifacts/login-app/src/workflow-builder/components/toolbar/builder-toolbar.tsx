import { useState } from "react";
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
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import { PublishDialog } from "../lifecycle/publish-dialog";
import { WorkflowStatusBadge } from "../lifecycle/workflow-status-badge";
import { BuilderStatusBar } from "../status/builder-status-bar";
import { usePermissions } from "@/hooks/use-rbac";

export function BuilderToolbar({
  controller,
  onBack,
}: {
  controller: WorkflowBuilderController;
  onBack: () => void;
}) {
  const { t } = useTranslation("common");
  const { hasPermission } = usePermissions();
  const [publishOpen, setPublishOpen] = useState(false);

  const align = (mode: AlignmentMode) => {
    const minRequired = mode.startsWith("distribute") ? 3 : 2;
    const builderSelection = controller.state.selectedNodeIds;
    controller.alignSelected(
      mode,
      builderSelection.length >= minRequired ? builderSelection : undefined,
    );
  };

  const focusWorkflowCanvas = () => {
    const pane = document.querySelector<HTMLElement>(".react-flow__pane");
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
          value={controller.state.document.name}
          onChange={(event) => controller.dispatch({ type: "SET_METADATA", patch: { name: event.target.value } })}
          className="max-w-sm rounded-xl border-border/60 bg-background/80"
          aria-label={t("workflowBuilder.fields.workflowName")}
          disabled={controller.state.document.readOnly}
        />
        <WorkflowStatusBadge
          status={controller.state.document.status}
          hasUnpublishedDraft={controller.state.document.hasUnpublishedDraft}
        />
        <BuilderStatusBar
          saveStatus={controller.state.saveStatus}
          validationCount={controller.state.validationIssues.filter((issue) => issue.severity === "error").length}
          documentStatus={controller.state.document.status}
          hasUnpublishedDraft={controller.state.document.hasUnpublishedDraft}
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
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={controller.applyAutoLayout}>
            <LayoutTemplate className="me-2 h-4 w-4" />
            {t("workflowBuilder.actions.autoLayout")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!controller.canUndo} onClick={controller.undo} className="rounded-xl" aria-label={t("workflowBuilder.actions.undo")}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!controller.canRedo} onClick={controller.redo} className="rounded-xl" aria-label={t("workflowBuilder.actions.redo")}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void controller.persist()} className="rounded-xl">
            <Save className="me-2 h-4 w-4" />
            {t("workflowBuilder.actions.saveDraft")}
          </Button>
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
          await controller.publish(releaseNotes);
        }}
      />
    </>
  );
}
