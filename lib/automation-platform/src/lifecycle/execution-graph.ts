import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
} from "../types.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import { snapshotToExecutionRecords } from "./version-repository.js";

export async function loadExecutionGraph(
  flow: AutomationFlowRecord,
  deps: {
    nodes: { listByFlowId(flowId: string): Promise<AutomationNodeRecord[]> };
    edges: { listByFlowId(flowId: string): Promise<AutomationEdgeRecord[]> };
    versions: AutomationFlowVersionRepository;
    versionId?: string | null;
  },
): Promise<{ nodes: AutomationNodeRecord[]; edges: AutomationEdgeRecord[]; versionId: string | null; versionNumber: number | null }> {
  const versionLookupId = deps.versionId ?? flow.active_version_id;
  if (versionLookupId) {
    const version = await deps.versions.findById(versionLookupId);
    if (version) {
      const mapped = snapshotToExecutionRecords(flow.id, version.snapshot);
      return {
        nodes: mapped.nodes as AutomationNodeRecord[],
        edges: mapped.edges as AutomationEdgeRecord[],
        versionId: version.id,
        versionNumber: version.version_number,
      };
    }
  }

  const activeVersion = await deps.versions.findActiveByFlowId(flow.id);
  if (activeVersion) {
    const mapped = snapshotToExecutionRecords(flow.id, activeVersion.snapshot);
    return {
      nodes: mapped.nodes as AutomationNodeRecord[],
      edges: mapped.edges as AutomationEdgeRecord[],
      versionId: activeVersion.id,
      versionNumber: activeVersion.version_number,
    };
  }

  const [nodes, edges] = await Promise.all([deps.nodes.listByFlowId(flow.id), deps.edges.listByFlowId(flow.id)]);
  return { nodes, edges, versionId: null, versionNumber: flow.version ?? null };
}
