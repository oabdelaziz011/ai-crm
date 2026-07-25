import type { AutomationEdgeRecord, AutomationFlowRecord, AutomationNodeRecord } from "../types.js";
import type { AutomationFlowRepository } from "../repositories/automation-repositories.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import type { AutomationFlowVersionGraphRepository } from "./version-graph-repository.js";
import type { AutomationFlowVersionRecord, CreateAutomationFlowVersionInput, WorkflowGraphSnapshot } from "./types.js";

export function createInMemoryAutomationFlowVersionRepository(): AutomationFlowVersionRepository & {
  records: AutomationFlowVersionRecord[];
} {
  const records: AutomationFlowVersionRecord[] = [];
  return {
    records,
    create: async (input: CreateAutomationFlowVersionInput) => {
      const record: AutomationFlowVersionRecord = {
        id: `version-${records.length + 1}`,
        flow_id: input.flowId,
        company_id: input.companyId,
        version_number: input.versionNumber,
        status: "published",
        release_notes: input.releaseNotes ?? "",
        snapshot: structuredClone(input.snapshot),
        is_active: false,
        is_immutable: true,
        published_at: new Date().toISOString(),
        published_by: input.publishedBy ?? null,
        created_at: new Date().toISOString(),
      };
      records.push(record);
      return record;
    },
    findById: async (id) => records.find((item) => item.id === id) ?? null,
    findByFlowAndNumber: async (flowId, versionNumber) =>
      records.find((item) => item.flow_id === flowId && item.version_number === versionNumber) ?? null,
    findActiveByFlowId: async (flowId) => records.find((item) => item.flow_id === flowId && item.is_active) ?? null,
    listByFlowId: async (flowId) => records.filter((item) => item.flow_id === flowId),
    setActiveVersion: async (flowId, versionId) => {
      for (const item of records) {
        item.is_active = item.flow_id === flowId && item.id === versionId;
      }
      return records.find((item) => item.id === versionId)!;
    },
    getNextVersionNumber: async (flowId) => {
      const latest = records
        .filter((item) => item.flow_id === flowId)
        .sort((a, b) => b.version_number - a.version_number)[0];
      return latest ? latest.version_number + 1 : 1;
    },
  };
}

export async function seedPublishedVersionGraph(input: {
  flowId: string;
  companyId: string;
  nodes: AutomationNodeRecord[];
  edges: AutomationEdgeRecord[];
  versions: AutomationFlowVersionRepository;
  versionGraph: AutomationFlowVersionGraphRepository;
  flows: AutomationFlowRepository;
  versionNumber?: number;
}): Promise<{ versionId: string; snapshot: WorkflowGraphSnapshot }> {
  const snapshot: WorkflowGraphSnapshot = {
    name: "Test Flow",
    description: "",
    triggerType: "manual",
    metadata: {},
    nodes: input.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      config: node.config,
      positionX: node.position_x,
      positionY: node.position_y,
    })),
    edges: input.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source_node_id,
      targetNodeId: edge.target_node_id,
      condition: edge.condition,
    })),
  };

  const versionNumber =
    input.versionNumber ?? (await input.versions.getNextVersionNumber(input.flowId));
  const version = await input.versions.create({
    flowId: input.flowId,
    companyId: input.companyId,
    versionNumber,
    snapshot,
  });

  await input.versionGraph.materialize({
    flowVersionId: version.id,
    flowId: input.flowId,
    snapshot,
  });
  await input.versions.setActiveVersion(input.flowId, version.id);
  await input.flows.update({
    flowId: input.flowId,
    activeVersionId: version.id,
    version: versionNumber,
    status: "active",
    hasUnpublishedDraft: false,
  });

  return { versionId: version.id, snapshot };
}

export function createMutableFlowRecord(
  overrides?: Partial<AutomationFlowRecord>,
): AutomationFlowRecord {
  return {
    id: "flow-1",
    company_id: "company-1",
    name: "Test Flow",
    description: "",
    trigger_type: "manual",
    status: "active",
    version: 0,
    active_version_id: null,
    has_unpublished_draft: true,
    metadata: {},
    created_by: "user-1",
    updated_by: "user-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}
