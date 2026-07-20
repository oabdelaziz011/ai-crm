import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/hooks/use-rbac";
import { registerBuiltInWorkflowNodes } from "../core/register-built-in-nodes";
import { registerBuiltInVariableProviders } from "../core/variables/built-in-variable-providers";
import { registerDefaultNodeRenderers } from "../core/registry/node-renderer-registry";
import type { WorkflowDocument } from "../core/types";
import { useWorkflowBuilderI18n } from "../hooks/use-workflow-builder-i18n";
import { useWorkflowBuilder } from "../hooks/use-workflow-builder";
import { useWorkflowBuilderKeyboard } from "../hooks/use-workflow-builder-keyboard";
import { useWorkflowBuilderServices } from "../context/workflow-builder-services";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import { VersionHistoryPanel } from "./lifecycle/version-history-panel";
import { UnsavedChangesDialog } from "./lifecycle/unsaved-changes-dialog";
import { NodePalette } from "./palette/node-palette";
import { PropertiesPanel } from "./properties/properties-panel";
import { BuilderToolbar } from "./toolbar/builder-toolbar";

export function WorkflowBuilderShell({
  document,
  onBack,
}: {
  document: WorkflowDocument;
  onBack: () => void;
}) {
  const { t } = useTranslation("common");
  const { validationMessage } = useWorkflowBuilderI18n();
  const { repository, context } = useWorkflowBuilderServices();
  const { hasPermission } = usePermissions();
  const controller = useWorkflowBuilder(document);
  useWorkflowBuilderKeyboard(controller);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    registerBuiltInWorkflowNodes();
    registerBuiltInVariableProviders();
    registerDefaultNodeRenderers();
  }, []);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!controller.hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [controller.hasUnsavedChanges]);

  const handleBack = () => {
    if (controller.hasUnsavedChanges) {
      setLeaveOpen(true);
      return;
    }
    onBack();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-20 flex flex-col gap-4 bg-background p-4 lg:start-64">
      <BuilderToolbar controller={controller} onBack={handleBack} />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px_320px] lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <NodePalette />
        <WorkflowCanvas controller={controller} />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex min-h-0 flex-col gap-4"
        >
          <PropertiesPanel controller={controller} />
          {controller.state.validationIssues.length > 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t("workflowBuilder.validation.title")}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {controller.state.validationIssues.slice(0, 4).map((issue) => (
                  <li key={issue.id}>• {validationMessage(issue)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </motion.div>
        <div className="hidden xl:block">
          <VersionHistoryPanel
            flowId={document.flowId}
            repository={repository}
            context={context}
            canRollback={hasPermission("automation.rollback")}
            onRollback={async (versionNumber) => {
              await controller.rollback(versionNumber);
            }}
          />
        </div>
      </div>
      <UnsavedChangesDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        onSave={() => {
          void controller.persist().finally(() => {
            setLeaveOpen(false);
            onBack();
          });
        }}
        onDiscard={() => {
          setLeaveOpen(false);
          onBack();
        }}
      />
    </div>
  );
}
