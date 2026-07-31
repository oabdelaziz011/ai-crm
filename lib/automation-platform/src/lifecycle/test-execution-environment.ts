import assert from "node:assert/strict";
import type {
  AutomationEdgeRepository,
  AutomationFlowRepository,
  AutomationNodeRepository,
  AutomationRunRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
  AutomationRunRecord,
  ConversationSessionRecord,
  ServiceContext,
} from "../types.js";
import { AutomationEngine } from "../engine/automation-engine.js";
import { createDefaultAutomationNodeRegistry } from "../engine/node-registry.js";
import { WorkflowPublishService } from "./publish-service.js";
import { WorkflowAuditService } from "./audit-service.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import type { WorkflowGraphSnapshot } from "./types.js";
import { createInMemoryAutomationFlowVersionGraphRepository } from "./test-version-graph-repository.js";
import { createInMemoryWorkflowPublishTransactionRepository } from "./test-publish-transaction-repository.js";

export function createVersionGraphTestContext(): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      ["automation.execute", "automation.view", "automation.publish"].includes(code),
  };
}

function createVersionGraphValidationLayer(
  versionGraph: ReturnType<typeof createInMemoryAutomationFlowVersionGraphRepository>,
  runRepository: AutomationRunRepository,
  sessionRepository: ConversationSessionRepository,
): {
  runs: AutomationRunRepository;
  sessions: ConversationSessionRepository;
} {
  async function assertVersionNode(flowVersionId: string | null | undefined, nodeId: string | null | undefined) {
    if (!flowVersionId || !nodeId) return;
    const exists = await versionGraph.hasNode(flowVersionId, nodeId);
    assert.equal(exists, true, `node ${nodeId} must exist in version graph ${flowVersionId}`);
  }

  return {
    runs: {
      ...runRepository,
      async create(input) {
        await assertVersionNode(input.flowVersionId, input.currentNodeId);
        return runRepository.create(input);
      },
      async updateState(input) {
        if (input.currentNodeId !== undefined) {
          const run = await runRepository.findById(input.runId);
          await assertVersionNode(
            input.flowVersionId ?? run?.flow_version_id ?? (run?.metadata.flowVersionId as string | undefined),
            input.currentNodeId,
          );
        }
        return runRepository.updateState(input);
      },
    },
    sessions: {
      ...sessionRepository,
      async create(input) {
        await assertVersionNode(input.flowVersionId, input.currentNodeId);
        return sessionRepository.create(input);
      },
      async updateState(input) {
        if (input.currentNodeId !== undefined) {
          const session = await sessionRepository.findById(input.sessionId);
          await assertVersionNode(input.flowVersionId ?? session?.flow_version_id, input.currentNodeId);
        }
        return sessionRepository.updateState(input);
      },
    },
  };
}

export function createExecutionEnvironment() {
  const flow: AutomationFlowRecord = {
    id: "aef7c4ab-513a-4b64-a700-2be6cf51dafc",
    company_id: "company-1",
    name: "WhatsApp Journey",
    description: "",
    trigger_type: "inbound_message",
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
  };

  const draftNodes: AutomationNodeRecord[] = [];
  const draftEdges: AutomationEdgeRecord[] = [];
  const runs: AutomationRunRecord[] = [];
  const sessions: ConversationSessionRecord[] = [];
  const versionRecords: Array<{
    id: string;
    flow_id: string;
    company_id: string;
    version_number: number;
    status: "published" | "archived";
    release_notes: string;
    snapshot: WorkflowGraphSnapshot;
    is_active: boolean;
    is_immutable: boolean;
    published_at: string | null;
    published_by: string | null;
    created_at: string;
  }> = [];

  const flowRepository: AutomationFlowRepository = {
    create: async () => flow,
    update: async (input) => {
      if (input.activeVersionId !== undefined) flow.active_version_id = input.activeVersionId;
      if (input.version !== undefined) flow.version = input.version;
      if (input.hasUnpublishedDraft !== undefined) flow.has_unpublished_draft = input.hasUnpublishedDraft;
      if (input.status !== undefined) flow.status = input.status;
      if (input.name !== undefined) flow.name = input.name;
      return flow;
    },
    updateStatus: async () => flow,
    softDelete: async () => flow,
    findById: async () => flow,
    findByName: async () => null,
    list: async () => [flow],
  };

  const versionRepository: AutomationFlowVersionRepository = {
    create: async (input) => {
      const record = {
        id: `version-${versionRecords.length + 1}`,
        flow_id: input.flowId,
        company_id: input.companyId,
        version_number: input.versionNumber,
        status: "published" as const,
        release_notes: input.releaseNotes ?? "",
        snapshot: structuredClone(input.snapshot),
        is_active: false,
        is_immutable: true,
        published_at: new Date().toISOString(),
        published_by: input.publishedBy ?? null,
        created_at: new Date().toISOString(),
      };
      versionRecords.push(record);
      return record;
    },
    findById: async (id) => versionRecords.find((item) => item.id === id) ?? null,
    findByFlowAndNumber: async (flowId, versionNumber) =>
      versionRecords.find((item) => item.flow_id === flowId && item.version_number === versionNumber) ?? null,
    findActiveByFlowId: async (flowId) => versionRecords.find((item) => item.flow_id === flowId && item.is_active) ?? null,
    listByFlowId: async (flowId) => versionRecords.filter((item) => item.flow_id === flowId),
    setActiveVersion: async (flowId, versionId) => {
      for (const item of versionRecords) {
        item.is_active = item.flow_id === flowId && item.id === versionId;
      }
      return versionRecords.find((item) => item.id === versionId)!;
    },
    getNextVersionNumber: async (flowId) => {
      const latest = versionRecords
        .filter((item) => item.flow_id === flowId)
        .sort((a, b) => b.version_number - a.version_number)[0];
      return latest ? latest.version_number + 1 : 1;
    },
  };

  const versionGraph = createInMemoryAutomationFlowVersionGraphRepository();

  const nodeRepository: AutomationNodeRepository = {
    create: async (input) => {
      const record: AutomationNodeRecord = {
        id: `956c034c-4dbd-474b-a9e2-1c3f479c7c91-${draftNodes.length}`,
        flow_id: input.flowId,
        type: input.type,
        config: input.config ?? {},
        position_x: input.positionX ?? 0,
        position_y: input.positionY ?? 0,
        created_at: new Date().toISOString(),
      };
      draftNodes.push(record);
      return record;
    },
    listByFlowId: async () => [...draftNodes],
    deleteByFlowId: async () => {
      draftNodes.length = 0;
    },
  };

  const edgeRepository: AutomationEdgeRepository = {
    create: async (input) => {
      const record: AutomationEdgeRecord = {
        id: `edge-${draftEdges.length + 1}`,
        flow_id: input.flowId,
        source_node_id: input.sourceNodeId,
        target_node_id: input.targetNodeId,
        condition: input.condition ?? {},
        created_at: new Date().toISOString(),
      };
      draftEdges.push(record);
      return record;
    },
    listByFlowId: async () => [...draftEdges],
    deleteByFlowId: async () => {
      draftEdges.length = 0;
    },
  };

  const baseRunRepository: AutomationRunRepository = {
    create: async (input) => {
      const record: AutomationRunRecord = {
        id: `run-${runs.length + 1}`,
        company_id: input.companyId,
        flow_id: input.flowId,
        status: input.status ?? "pending",
        trigger_source: input.triggerSource ?? "manual",
        started_at: new Date().toISOString(),
        finished_at: null,
        error_message: null,
        metadata: input.metadata ?? {},
        flow_version_id: input.flowVersionId ?? null,
        current_node_id: input.currentNodeId ?? null,
        session_id: input.sessionId ?? null,
        variables: input.variables ?? {},
      };
      runs.push(record);
      return record;
    },
    findById: async (id) => runs.find((item) => item.id === id) ?? null,
    findBySessionId: async (sessionId) => runs.find((item) => item.session_id === sessionId) ?? null,
    list: async () => [...runs],
    updateState: async (input) => {
      const record = runs.find((item) => item.id === input.runId)!;
      if (input.expectedStatus !== undefined && record.status !== input.expectedStatus) {
        throw new Error(`Automation run ${input.runId} state changed concurrently (expected status ${String(input.expectedStatus)}).`);
      }
      if (input.status !== undefined) record.status = input.status;
      if (input.flowVersionId !== undefined) record.flow_version_id = input.flowVersionId;
      if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
      if (input.sessionId !== undefined) record.session_id = input.sessionId;
      if (input.variables !== undefined) record.variables = input.variables;
      if (input.finishedAt !== undefined) record.finished_at = input.finishedAt;
      if (input.errorMessage !== undefined) record.error_message = input.errorMessage;
      return { ...record };
    },
  };

  const baseSessionRepository: ConversationSessionRepository = {
    create: async (input) => {
      const record: ConversationSessionRecord = {
        id: `session-${sessions.length + 1}`,
        company_id: input.companyId,
        channel: input.channel,
        external_user_id: input.externalUserId ?? null,
        customer_id: input.customerId ?? null,
        flow_id: input.flowId ?? null,
        flow_version_id: input.flowVersionId ?? null,
        run_id: input.runId ?? null,
        current_node_id: input.currentNodeId ?? null,
        status: input.status ?? "active",
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        metadata: input.metadata ?? {},
        variables: input.variables ?? {},
      };
      sessions.push(record);
      return record;
    },
    findById: async (id) => sessions.find((item) => item.id === id) ?? null,
    findActiveSession: async (input) =>
      sessions.find(
        (item) =>
          item.company_id === input.companyId &&
          item.channel === input.channel &&
          item.external_user_id === input.externalUserId &&
          ["active", "running", "waiting_input", "paused"].includes(item.status),
      ) ?? null,
    list: async () => [...sessions],
    updateState: async (input) => {
      const record = sessions.find((item) => item.id === input.sessionId)!;
      if (input.status !== undefined) record.status = input.status;
      if (input.flowVersionId !== undefined) record.flow_version_id = input.flowVersionId;
      if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
      if (input.runId !== undefined) record.run_id = input.runId;
      if (input.variables !== undefined) record.variables = input.variables;
      record.last_activity_at = input.lastActivityAt ?? new Date().toISOString();
      return { ...record };
    },
  };

  const validated = createVersionGraphValidationLayer(versionGraph, baseRunRepository, baseSessionRepository);

  const publishTransaction = createInMemoryWorkflowPublishTransactionRepository({
    flows: flowRepository,
    versions: versionRepository,
    versionGraph,
  });

  const publish = new WorkflowPublishService(flowRepository, publishTransaction, new WorkflowAuditService());
  const engine = new AutomationEngine({
    flows: flowRepository,
    runs: validated.runs,
    sessions: validated.sessions,
    versions: versionRepository,
    versionGraph,
    registry: createDefaultAutomationNodeRegistry(),
  });

  return {
    flow,
    draftNodes,
    draftEdges,
    runs,
    sessions,
    versionRecords,
    versionGraph,
    publish,
    engine,
    nodeRepository,
    edgeRepository,
    flowRepository,
    versionRepository,
    runRepository: validated.runs,
    sessionRepository: validated.sessions,
  };
}
