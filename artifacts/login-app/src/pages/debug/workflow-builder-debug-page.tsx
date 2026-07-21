/**
 * Temporary runtime debug page — not used for production instrumentation.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { WorkflowBuilderShell } from "@/workflow-builder/components/workflow-builder-shell";
import { WorkflowBuilderServicesProvider } from "@/workflow-builder/context/workflow-builder-services";
import type { WorkflowDocument } from "@/workflow-builder/core/types";
import { registerBuiltInWorkflowNodes } from "@/workflow-builder/core/register-built-in-nodes";
import { createBuilderNode } from "@/workflow-builder/core/persistence/workflow-mapper";
import { createEdgeFromNodes } from "@/workflow-builder/core/state/builder-reducer";
import type { WorkflowRepository } from "@/workflow-builder/core/persistence/workflow-repository";
import type { ServiceContext } from "@workspace/automation-platform";

function createMockDocument(): WorkflowDocument {
  registerBuiltInWorkflowNodes();
  return {
    flowId: "debug-flow-1",
    companyId: "debug-co",
    name: "Debug Workflow",
    description: "",
    triggerType: "inbound_message",
    status: "draft",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      createBuilderNode("start", { x: 100, y: 80 }, "dbg-start"),
      createBuilderNode("send_message", { x: 400, y: 120 }, "dbg-msg"),
      createBuilderNode("end", { x: 700, y: 200 }, "dbg-end"),
    ],
    edges: [
      createEdgeFromNodes("dbg-start", "dbg-msg"),
      createEdgeFromNodes("dbg-msg", "dbg-end"),
    ],
  };
}

function createMockRepository(): WorkflowRepository {
  const doc = createMockDocument();
  return {
    list: async () => [],
    load: async () => structuredClone(doc),
    loadVersion: async () => null,
    create: async () => doc,
    save: async (_ctx, document) => document,
    publish: async (_ctx, document) => document,
    listVersions: async () => [],
    compareVersions: async () =>
      ({
        addedNodes: [],
        removedNodes: [],
        changedNodeProperties: [],
        addedConnections: [],
        removedConnections: [],
        changedConnectionProperties: [],
        metadataChanges: [],
      }) as never,
    rollback: async () => doc,
    archive: async () => undefined,
    getLifecycle: async () => ({ versions: [], audit: [] }),
  };
}

const mockContext: ServiceContext = {
  userId: "debug-user",
  companyId: "debug-co",
  isSuperAdmin: true,
  hasPermission: () => true,
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export default function WorkflowBuilderDebugPage() {
  const document = useMemo(() => structuredClone(createMockDocument()), []);

  return (
    <QueryClientProvider client={queryClient}>
      <WorkflowBuilderServicesProvider
        value={{
          repository: createMockRepository(),
          context: mockContext,
          automation: {} as never,
        }}
      >
        <WorkflowBuilderShell document={document} onBack={() => undefined} />
      </WorkflowBuilderServicesProvider>
    </QueryClientProvider>
  );
}
