import {
  buildVersionGraphRows,
  versionGraphRowsToExecutionRecords,
  type AutomationFlowVersionGraphRepository,
  type VersionGraphEdgeRow,
  type VersionGraphNodeRow,
} from "./version-graph-repository.js";

export function createInMemoryAutomationFlowVersionGraphRepository(): AutomationFlowVersionGraphRepository & {
  listNodes(flowVersionId: string): string[];
} {
  const nodesByVersion = new Map<string, VersionGraphNodeRow[]>();
  const edgesByVersion = new Map<string, VersionGraphEdgeRow[]>();

  return {
    async materialize(input) {
      const { nodes, edges } = buildVersionGraphRows(input);
      nodesByVersion.set(input.flowVersionId, nodes);
      edgesByVersion.set(input.flowVersionId, edges);
    },
    async hasNode(flowVersionId, nodeId) {
      return (nodesByVersion.get(flowVersionId) ?? []).some((node) => node.id === nodeId);
    },
    async listExecutionGraph(flowVersionId, flowId) {
      return versionGraphRowsToExecutionRecords(
        flowId,
        nodesByVersion.get(flowVersionId) ?? [],
        edgesByVersion.get(flowVersionId) ?? [],
      );
    },
    listNodes(flowVersionId) {
      return (nodesByVersion.get(flowVersionId) ?? []).map((node) => node.id);
    },
  };
}

export function createNoopAutomationFlowVersionGraphRepository(): AutomationFlowVersionGraphRepository {
  return createInMemoryAutomationFlowVersionGraphRepository();
}
