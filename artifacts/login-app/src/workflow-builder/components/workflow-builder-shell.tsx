import { useEffect, useState, type ReactNode } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { usePermissions } from "@/hooks/use-rbac";
import { registerBuiltInWorkflowNodes } from "../core/register-built-in-nodes";
import { registerBuiltInVariableProviders } from "../core/variables/built-in-variable-providers";
import { registerDefaultNodeRenderers } from "../core/registry/node-renderer-registry";
import { registerTriggerPlatform } from "../triggers/register-trigger-platform";
import type { WorkflowDocument } from "../core/types";
import { useWorkflowBuilder } from "../hooks/use-workflow-builder";
import { useWorkflowBuilderKeyboard } from "../hooks/use-workflow-builder-keyboard";
import { useWorkflowBuilderServices } from "../context/workflow-builder-services";
import { WorkflowBuilderProvider } from "../context/workflow-builder-context";
import { WorkflowBuilderWorkspace } from "./workflow-builder-workspace";
import { UnsavedChangesDialog } from "./lifecycle/unsaved-changes-dialog";

export function WorkflowBuilderShell({
  document,
  onBack,
  enableCanvasSyncTrace = false,
}: {
  document: WorkflowDocument;
  onBack: () => void;
  enableCanvasSyncTrace?: boolean;
}) {
  const { repository, context } = useWorkflowBuilderServices();
  const { hasPermission } = usePermissions();
  const controller = useWorkflowBuilder(document);
  useWorkflowBuilderKeyboard(controller);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [TraceBoundary, setTraceBoundary] = useState<(({ children }: { children: ReactNode }) => ReactNode) | null>(
    null,
  );

  useEffect(() => {
    registerBuiltInWorkflowNodes();
    registerBuiltInVariableProviders();
    registerDefaultNodeRenderers();
    registerTriggerPlatform();
  }, []);

  useEffect(() => {
    if (!enableCanvasSyncTrace) {
      setTraceBoundary(null);
      return;
    }

    let active = true;
    void import("../debug/workflow-builder-canvas-sync-trace-boundary").then((module) => {
      if (active) {
        setTraceBoundary(() => module.WorkflowBuilderCanvasSyncTraceBoundary);
      }
    });

    return () => {
      active = false;
    };
  }, [enableCanvasSyncTrace]);

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

  const builderSurface = (
    <WorkflowBuilderWorkspace
      controller={controller}
      document={document}
      repository={repository}
      context={context}
      canRollback={hasPermission("automation.rollback")}
      onRollback={async (versionNumber) => {
        await controller.rollback(versionNumber);
      }}
      onBack={handleBack}
      TraceBoundary={TraceBoundary}
    />
  );

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-20 flex flex-col gap-4 bg-background p-4 lg:start-64">
      <WorkflowBuilderProvider controller={controller}>
        <ReactFlowProvider>{builderSurface}</ReactFlowProvider>
      </WorkflowBuilderProvider>
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
