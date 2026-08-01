import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { DashboardPageFallback } from "@/components/dashboard/ui";
import { usePermissions } from "@/hooks/use-rbac";
import type { ServiceContext } from "@workspace/automation-platform";
import { useDocumentBuilderSlice, useBuilderActions } from "../context/workflow-builder-context";
import type { WorkflowBuilderController } from "../hooks/use-workflow-builder";
import type { WorkflowDocument } from "../core/types";
import type { WorkflowRepository } from "../core/persistence/workflow-repository";
import { DebugFoundationProvider } from "../debugger/context/debug-context";
import { useWorkflowDebugger } from "../debugger/hooks/use-workflow-debugger";
import { useWorkflowSimulation } from "../simulation/hooks/use-workflow-simulation";
import { hasWorkflowSimulationPermission } from "../simulation/permissions/workflow-simulation-access";
import { useWorkflowTesting } from "../testing/hooks/use-workflow-testing";
import { hasWorkflowTestingPermission } from "../testing/permissions/testing-access";
import { useWorkflowTriggerConfiguration } from "../triggers/hooks/use-workflow-trigger-configuration";
import { TriggerConfigurationProvider } from "../triggers/context/trigger-configuration-context";
import { BuilderToolbar } from "./toolbar/builder-toolbar";
import { CollapsiblePropertiesPanel } from "./properties/collapsible-properties-panel";
import { WorkflowCanvas } from "./canvas/workflow-canvas";
import { CollapsibleNodePalette } from "./palette/collapsible-node-palette";

const TestingPanel = lazy(() =>
  import("../testing/components/testing-panel").then((module) => ({
    default: module.TestingPanel,
  })),
);

const SimulationPanel = lazy(() =>
  import("./simulation/simulation-panel").then((module) => ({
    default: module.SimulationPanel,
  })),
);

const DebuggerPanel = lazy(() =>
  import("../debugger/components/debugger-panel").then((module) => ({
    default: module.DebuggerPanel,
  })),
);

type WorkflowBuilderWorkspaceProps = {
  controller: WorkflowBuilderController;
  document: WorkflowDocument;
  repository: WorkflowRepository;
  context: ServiceContext;
  canRollback: boolean;
  onRollback: (versionNumber: number) => Promise<void>;
  onBack: () => void;
  enableCanvasSyncTrace?: boolean;
  TraceBoundary?: (({ children }: { children: ReactNode }) => ReactNode) | null;
};

export function WorkflowBuilderWorkspace({
  controller,
  document,
  repository,
  context,
  canRollback,
  onRollback,
  onBack,
  TraceBoundary,
}: WorkflowBuilderWorkspaceProps) {
  const { hasPermission, isSuperAdmin } = usePermissions();
  const canSimulate = hasWorkflowSimulationPermission(hasPermission, isSuperAdmin);
  const canTest = hasWorkflowTestingPermission(hasPermission, isSuperAdmin);
  const liveDocument = controller.state.document;
  const simulation = useWorkflowSimulation(liveDocument, { enabled: canSimulate });
  const testing = useWorkflowTesting(liveDocument, { enabled: canTest });
  const debuggerController = useWorkflowDebugger(liveDocument, canSimulate ? simulation : null, {
    enabled: canSimulate,
  });
  const triggerConfiguration = useWorkflowTriggerConfiguration(liveDocument);
  const { selectedNodeIds } = useDocumentBuilderSlice();
  const { dispatch } = useBuilderActions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const focusNode = (nodeId: string) => {
    dispatch({ type: "SELECT_NODES", nodeIds: [nodeId] });
  };

  const workspace = (
    <DebugFoundationProvider debugger={debuggerController}>
      <TriggerConfigurationProvider
        trigger={triggerConfiguration}
        simulation={canSimulate ? simulation : null}
      >
      <>
        <BuilderToolbar
          controller={controller}
          onBack={onBack}
          simulation={canSimulate ? simulation : null}
          testing={canTest ? testing : null}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-visible">
          <div className="flex min-h-0 flex-1 gap-4 overflow-visible">
            <CollapsiblePropertiesPanel
              controller={controller}
              document={document}
              repository={repository}
              context={context}
              canRollback={canRollback}
              onRollback={onRollback}
            />
            <div className="min-h-0 min-w-0 flex-1">
              <WorkflowCanvas />
            </div>
            <CollapsibleNodePalette />
          </div>
          {canSimulate && simulation.panelOpen ? (
            <div className="flex h-80 shrink-0 gap-2">
              <div className="min-h-0 min-w-0 flex-1">
                <Suspense fallback={<DashboardPageFallback />}>
                  <SimulationPanel
                    document={liveDocument}
                    simulation={simulation}
                    selectedNodeIds={selectedNodeIds}
                    onFocusNode={focusNode}
                  />
                </Suspense>
              </div>
              {debuggerController.enabled ? (
                <div className="min-h-0 min-w-0 flex-1">
                  <Suspense fallback={<DashboardPageFallback />}>
                    <DebuggerPanel onFocusNode={focusNode} />
                  </Suspense>
                </div>
              ) : null}
            </div>
          ) : null}
          {canTest && testing.panelOpen ? (
            <div className="h-80 shrink-0">
              <Suspense fallback={<DashboardPageFallback />}>
                <TestingPanel testing={testing} onFocusNode={focusNode} />
              </Suspense>
            </div>
          ) : null}
        </div>
      </>
      </TriggerConfigurationProvider>
    </DebugFoundationProvider>
  );

  if (!mounted) return workspace;
  return TraceBoundary ? <TraceBoundary>{workspace}</TraceBoundary> : workspace;
}
