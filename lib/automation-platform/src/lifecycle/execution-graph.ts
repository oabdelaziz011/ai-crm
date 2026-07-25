import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
} from "../types.js";
import { AutomationExecutionError, AutomationFlowVersionNotFoundError } from "../errors.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import type { AutomationFlowVersionGraphRepository } from "./version-graph-repository.js";
import { snapshotToExecutionRecords } from "./version-repository.js";

export type ExecutionGraphBundle = {
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
  versionId: string;
  versionNumber: number;
};

export async function loadExecutionGraph(
  flow: AutomationFlowRecord,
  deps: {
    versions: AutomationFlowVersionRepository;
    versionGraph: AutomationFlowVersionGraphRepository;
    versionId: string;
  },
): Promise<ExecutionGraphBundle> {
  const version = await deps.versions.findById(deps.versionId);
  if (!version) {
    throw new AutomationFlowVersionNotFoundError(deps.versionId);
  }
  if (version.flow_id !== flow.id) {
    throw new AutomationExecutionError(
      `Version ${deps.versionId} does not belong to flow ${flow.id}.`,
    );
  }

  const materialized = await deps.versionGraph.listExecutionGraph(deps.versionId, flow.id);
  if (materialized.nodes.length > 0) {
    return {
      nodes: materialized.nodes,
      edges: materialized.edges,
      versionId: version.id,
      versionNumber: version.version_number,
    };
  }

  const mapped = snapshotToExecutionRecords(flow.id, version.snapshot);
  return {
    nodes: mapped.nodes as AutomationNodeRecord[],
    edges: mapped.edges as AutomationEdgeRecord[],
    versionId: version.id,
    versionNumber: version.version_number,
  };
}

export async function resolveExecutionVersionId(input: {
  flow: AutomationFlowRecord;
  pinnedVersionId?: string | null;
}): Promise<string> {
  const versionId = input.pinnedVersionId ?? input.flow.active_version_id;
  if (!versionId) {
    throw new AutomationExecutionError(
      `Flow ${input.flow.id} has no published version available for execution.`,
    );
  }
  return versionId;
}
