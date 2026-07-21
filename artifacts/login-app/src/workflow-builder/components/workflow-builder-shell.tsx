import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { usePermissions } from "@/hooks/use-rbac";
import { useAppSidebar } from "@/context/app-sidebar-context";
import { registerBuiltInWorkflowNodes } from "../core/register-built-in-nodes";
import { registerBuiltInVariableProviders } from "../core/variables/built-in-variable-providers";
import { registerDefaultNodeRenderers } from "../core/registry/node-renderer-registry";
import type { WorkflowDocument } from "../core/types";
import { useWorkflowBuilder } from "../hooks/use-workflow-builder";
import { useWorkflowBuilderKeyboard } from "../hooks/use-workflow-builder-keyboard";
import { useWorkflowBuilderServices } from "../context/workflow-builder-services";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import { UnsavedChangesDialog } from "./lifecycle/unsaved-changes-dialog";
import { CollapsibleNodePalette } from "./palette/collapsible-node-palette";
import { CollapsiblePropertiesPanel } from "./properties/collapsible-properties-panel";
import { BuilderToolbar } from "./toolbar/builder-toolbar";

export function WorkflowBuilderShell({
  document,
  onBack,
}: {
  document: WorkflowDocument;
  onBack: () => void;
}) {
  const { repository, context } = useWorkflowBuilderServices();
  const { hasPermission } = usePermissions();
  const { offsetStartPx } = useAppSidebar();
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
    <div
      className="fixed bottom-0 top-16 z-20 flex flex-col gap-4 bg-background p-4 transition-[inset-inline-start] duration-[250ms] ease-in-out"
      style={{ insetInlineStart: offsetStartPx, insetInlineEnd: 0 }}
    >
      <ReactFlowProvider>
        <BuilderToolbar controller={controller} onBack={handleBack} />
        <div className="flex min-h-0 flex-1 gap-4 overflow-visible">
          <CollapsiblePropertiesPanel
            controller={controller}
            document={document}
            repository={repository}
            context={context}
            canRollback={hasPermission("automation.rollback")}
            onRollback={async (versionNumber) => {
              await controller.rollback(versionNumber);
            }}
          />
          <div className="min-h-0 min-w-0 flex-1">
            <WorkflowCanvas controller={controller} />
          </div>
          <CollapsibleNodePalette />
        </div>
      </ReactFlowProvider>
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
