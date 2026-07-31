import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
import { loadExecutionGraph } from "./execution-graph.js";
import { WorkflowPublishService } from "./publish-service.js";
import { WorkflowAuditService } from "./audit-service.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";
import type { WorkflowGraphSnapshot } from "./types.js";
import {
  createInMemoryAutomationFlowVersionGraphRepository,
  type AutomationFlowVersionGraphRepository,
} from "./test-version-graph-repository.js";
import { createInMemoryWorkflowPublishTransactionRepository } from "./test-publish-transaction-repository.js";
import {
  buildVersionGraphRows,
  type AutomationFlowVersionGraphRepository,
} from "./version-graph-repository.js";

function createContext(): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      ["automation.execute", "automation.view", "automation.publish"].includes(code),
  };
}

const publishedSnapshot: WorkflowGraphSnapshot = {
  name: "WhatsApp Journey",
  description: "Inbound routing",
  triggerType: "inbound_message",
  metadata: {},
  nodes: [
    {
      id: "67a3b77c-6feb-446c-bbf3-5e98d2ea9665",
      type: "trigger",
      config: { builderType: "start", label: "When someone messages you" },
      positionX: 0,
      positionY: 0,
    },
    {
      id: "fc9c8791-4e89-4bb9-b1df-e855fe8c8115",
      type: "action",
      config: { builderType: "send_message", action: "send_message", message: "Hello" },
      positionX: 0,
      positionY: 120,
    },
    {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      type: "end",
      config: { builderType: "end" },
      positionX: 0,
      positionY: 240,
    },
  ],
  edges: [
    {
      id: "67a3b77c-6feb-446c-bbf3-5e98d2ea9665->fc9c8791-4e89-4bb9-b1df-e855fe8c8115",
      sourceNodeId: "67a3b77c-6feb-446c-bbf3-5e98d2ea9665",
      targetNodeId: "fc9c8791-4e89-4bb9-b1df-e855fe8c8115",
      condition: {},
    },
    {
      id: "fc9c8791-4e89-4bb9-b1df-e855fe8c8115->a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      sourceNodeId: "fc9c8791-4e89-4bb9-b1df-e855fe8c8115",
      targetNodeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      condition: {},
    },
  ],
};

const republishedSnapshot: WorkflowGraphSnapshot = {
  ...publishedSnapshot,
  name: "WhatsApp Journey v2",
  nodes: publishedSnapshot.nodes.map((node) =>
    node.config.builderType === "send_message"
      ? { ...node, config: { ...node.config, message: "Updated greeting" } }
      : node,
  ),
};

const WAIT_NODE_ID = "11111111-1111-4111-8111-111111111111";
const waitingInputSnapshot: WorkflowGraphSnapshot = {
  ...publishedSnapshot,
  name: "WhatsApp Journey (waiting)",
  nodes: [
    publishedSnapshot.nodes[0]!,
    {
      id: WAIT_NODE_ID,
      type: "action",
      config: { action: "wait_for_input", inputKey: "reply", prompt: "Reply please" },
      positionX: 0,
      positionY: 120,
    },
    publishedSnapshot.nodes[2]!,
  ],
  edges: [
    {
      id: "trigger->wait",
      sourceNodeId: "67a3b77c-6feb-446c-bbf3-5e98d2ea9665",
      targetNodeId: WAIT_NODE_ID,
      condition: {},
    },
    {
      id: "wait->end",
      sourceNodeId: WAIT_NODE_ID,
      targetNodeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      condition: {},
    },
  ],
};

function createFailingVersionGraphRepository(
  base: ReturnType<typeof createInMemoryAutomationFlowVersionGraphRepository>,
  failOnMaterialize: boolean,
): AutomationFlowVersionGraphRepository {
  return {
    async materialize(input) {
      if (failOnMaterialize) {
        throw new Error("Version graph materialization failed.");
      }
      return base.materialize(input);
    },
    hasNode: (flowVersionId, nodeId) => base.hasNode(flowVersionId, nodeId),
    listExecutionGraph: (flowVersionId, flowId) => base.listExecutionGraph(flowVersionId, flowId),
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

function createExecutionEnvironment() {
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

describe("version graph execution integrity", () => {
  it("materializes immutable version nodes on publish", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";

    const result = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
      releaseNotes: "Initial publish",
    });

    const rows = buildVersionGraphRows({
      flowVersionId: result.version.id,
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });
    assert.equal(rows.nodes.length, 3);
    assert.deepEqual(
      env.versionGraph.listNodes(result.version.id).sort(),
      rows.nodes.map((node) => node.id).sort(),
    );
  });

  it("creates conversation sessions using published snapshot node ids", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    await env.publish.publish(createContext(), { flowId: env.flow.id, snapshot: publishedSnapshot });

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      triggerSource: "inbound_message",
      externalUserId: "201011404109",
      initialVariables: { lastMessage: "Hello" },
    });

    assert.equal(result.session.flow_version_id, "version-1");
    assert.equal(result.run.flow_version_id, "version-1");
    assert.equal(result.run.current_node_id, "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    assert.equal(
      await env.versionGraph.hasNode("version-1", "67a3b77c-6feb-446c-bbf3-5e98d2ea9665"),
      true,
    );
  });

  it("keeps pinned execution valid after draft save regenerates live automation_nodes", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    await env.publish.publish(createContext(), { flowId: env.flow.id, snapshot: publishedSnapshot });

    const started = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      triggerSource: "inbound_message",
      externalUserId: "201011404109",
    });

    await env.nodeRepository.deleteByFlowId(env.flow.id);
    await env.edgeRepository.deleteByFlowId(env.flow.id);
    await env.nodeRepository.create({
      flowId: env.flow.id,
      type: "trigger",
      config: { builderType: "start", label: "When someone messages you" },
    });
    env.flow.has_unpublished_draft = true;

    assert.equal(env.draftNodes.length, 1);
    assert.notEqual(env.draftNodes[0]?.id, "67a3b77c-6feb-446c-bbf3-5e98d2ea9665");

    const resumed = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      triggerSource: "inbound_message",
      externalUserId: "201011404109-new",
    });

    assert.equal(resumed.session.flow_version_id, "version-1");
    assert.equal(started.session.flow_version_id, "version-1");
    assert.equal(
      await env.versionGraph.hasNode("version-1", "67a3b77c-6feb-446c-bbf3-5e98d2ea9665"),
      true,
    );
  });

  it("republish creates a new version graph without mutating prior versions", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";

    const first = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });
    const second = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: republishedSnapshot,
      releaseNotes: "Copy update",
    });

    assert.notEqual(first.version.id, second.version.id);
    assert.deepEqual(env.versionGraph.listNodes(first.version.id).sort(), [
      "67a3b77c-6feb-446c-bbf3-5e98d2ea9665",
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "fc9c8791-4e89-4bb9-b1df-e855fe8c8115",
    ].sort());
    assert.deepEqual(env.versionGraph.listNodes(second.version.id).sort(), [
      "67a3b77c-6feb-446c-bbf3-5e98d2ea9665",
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "fc9c8791-4e89-4bb9-b1df-e855fe8c8115",
    ].sort());
    assert.equal(env.versionRecords.length, 2);
  });

  it("rejects runtime state that references draft-only node ids", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    const published = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });

    await env.nodeRepository.deleteByFlowId(env.flow.id);
    const draftTrigger = await env.nodeRepository.create({
      flowId: env.flow.id,
      type: "trigger",
      config: { builderType: "start" },
    });

    assert.notEqual(draftTrigger.id, "67a3b77c-6feb-446c-bbf3-5e98d2ea9665");
    assert.equal(await env.versionGraph.hasNode(published.version.id, draftTrigger.id), false);

    await assert.rejects(
      () =>
        createVersionGraphValidationLayer(
          env.versionGraph,
          {
            create: async () => {
              throw new Error("should not reach create");
            },
            findById: async () => null,
            findBySessionId: async () => null,
            list: async () => [],
            updateState: async () => {
              throw new Error("should not reach update");
            },
          },
          {
            create: async (input) => {
              if (!input.flowVersionId || !input.currentNodeId) {
                throw new Error("missing version state");
              }
              const exists = await env.versionGraph.hasNode(input.flowVersionId, input.currentNodeId);
              assert.equal(exists, true);
              return {
                id: "session-x",
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
            },
            findById: async () => null,
            findActiveSession: async () => null,
            list: async () => [],
            updateState: async () => {
              throw new Error("should not reach update");
            },
          },
        ).sessions.create({
          companyId: "company-1",
          channel: "whatsapp",
          flowId: env.flow.id,
          flowVersionId: published.version.id,
          currentNodeId: draftTrigger.id,
        }),
    );
  });
});

describe("version graph hardening regressions", () => {
  it("pins each run to its published version when multiple versions execute", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";

    const first = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });
    const runV1 = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      triggerSource: "inbound_message",
      externalUserId: "201011404109",
    });

    const second = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: republishedSnapshot,
      releaseNotes: "v2",
    });
    const runV2 = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      triggerSource: "inbound_message",
      externalUserId: "201011404110",
    });

    assert.equal(runV1.run.flow_version_id, first.version.id);
    assert.equal(runV2.run.flow_version_id, second.version.id);
    assert.notEqual(first.version.id, second.version.id);
    assert.equal(
      await env.versionGraph.hasNode(first.version.id, runV1.run.current_node_id!),
      true,
    );
    assert.equal(
      await env.versionGraph.hasNode(second.version.id, runV2.run.current_node_id!),
      true,
    );
  });

  it("resumes waiting conversations after draft nodes are regenerated", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: waitingInputSnapshot,
    });

    const paused = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      triggerSource: "inbound_message",
      externalUserId: "201011404111",
    });
    assert.equal(paused.lifecycle, "waiting_input");
    assert.equal(paused.run.flow_version_id, "version-1");
    assert.equal(paused.currentNodeId, WAIT_NODE_ID);

    await env.nodeRepository.deleteByFlowId(env.flow.id);
    await env.edgeRepository.deleteByFlowId(env.flow.id);
    await env.nodeRepository.create({
      flowId: env.flow.id,
      type: "trigger",
      config: { builderType: "start", label: "Regenerated trigger" },
    });
    env.flow.has_unpublished_draft = true;

    const resumed = await env.engine.resume(createContext(), {
      runId: paused.run.id,
      input: { reply: "Yes" },
    });

    assert.equal(resumed.lifecycle, "completed");
    assert.equal(resumed.run.flow_version_id, "version-1");
    assert.equal(await env.versionGraph.hasNode("version-1", WAIT_NODE_ID), true);
  });

  it("resumes pinned execution from a fresh engine instance after restart", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: waitingInputSnapshot,
    });

    const paused = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      externalUserId: "201011404112",
    });

    const restartedEngine = new AutomationEngine({
      flows: env.flowRepository,
      runs: env.runRepository,
      sessions: env.sessionRepository,
      versions: env.versionRepository,
      versionGraph: env.versionGraph,
      registry: createDefaultAutomationNodeRegistry(),
    });

    const resumed = await restartedEngine.resume(createContext(), {
      runId: paused.run.id,
      input: { reply: "After restart" },
    });

    assert.equal(resumed.lifecycle, "completed");
    assert.equal(resumed.run.flow_version_id, "version-1");
  });

  it("resumes waiting runs when the flow is no longer active", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: waitingInputSnapshot,
    });

    const paused = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: env.flow.id,
      channel: "whatsapp",
      externalUserId: "201011404113",
    });

    env.flow.status = "draft";
    env.flow.active_version_id = null;

    const resumed = await env.engine.resume(createContext(), {
      runId: paused.run.id,
      input: { reply: "Unpublished flow" },
    });

    assert.equal(resumed.lifecycle, "completed");
    assert.equal(resumed.run.flow_version_id, "version-1");
  });

  it("leaves active_version_id unchanged when publish materialization fails", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";

    const first = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });
    assert.equal(env.flow.active_version_id, first.version.id);

    const failingGraph = createFailingVersionGraphRepository(env.versionGraph, true);
    const failingPublish = new WorkflowPublishService(
      env.flowRepository,
      createInMemoryWorkflowPublishTransactionRepository({
        flows: env.flowRepository,
        versions: env.versionRepository,
        versionGraph: failingGraph,
      }),
      new WorkflowAuditService(),
    );

    await assert.rejects(
      () =>
        failingPublish.publish(createContext(), {
          flowId: env.flow.id,
          snapshot: republishedSnapshot,
        }),
      /materialization failed/i,
    );

    assert.equal(env.flow.active_version_id, first.version.id);
    assert.equal(env.versionRecords.length, 2);
    assert.equal(env.versionGraph.listNodes(first.version.id).length, 3);
    assert.equal(env.versionGraph.listNodes("version-2").length, 0);
  });

  it("handles concurrent inbound WhatsApp starts without cross-contaminating version pins", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });

    const results = await Promise.all(
      ["wa-user-1", "wa-user-2", "wa-user-3"].map((externalUserId) =>
        env.engine.start(createContext(), {
          companyId: "company-1",
          flowId: env.flow.id,
          channel: "whatsapp",
          triggerSource: "inbound_message",
          externalUserId,
        }),
      ),
    );

    for (const result of results) {
      assert.equal(result.run.flow_version_id, "version-1");
      assert.equal(result.session.flow_version_id, "version-1");
      assert.equal(
        await env.versionGraph.hasNode("version-1", result.run.current_node_id!),
        true,
      );
    }
    assert.equal(new Set(results.map((item) => item.run.id)).size, 3);
  });

  it("validates materialized graph integrity against snapshot counts", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    const published = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });

    const rows = buildVersionGraphRows({
      flowVersionId: published.version.id,
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });
    const materializedNodes = env.versionGraph.listNodes(published.version.id);

    assert.equal(rows.nodes.length, publishedSnapshot.nodes.length);
    assert.equal(materializedNodes.length, publishedSnapshot.nodes.length);
    assert.equal(rows.edges.length, publishedSnapshot.edges.length);

    for (const node of rows.nodes) {
      assert.equal(await env.versionGraph.hasNode(published.version.id, node.id), true);
    }
    for (const edge of rows.edges) {
      assert.equal(await env.versionGraph.hasNode(published.version.id, edge.source_node_id), true);
      assert.equal(await env.versionGraph.hasNode(published.version.id, edge.target_node_id), true);
    }
  });

  it("passes backfill consistency checks for snapshot-to-graph mapping", () => {
    const rows = buildVersionGraphRows({
      flowVersionId: "version-backfill",
      flowId: "flow-backfill",
      snapshot: publishedSnapshot,
    });

    const nodeIds = new Set(rows.nodes.map((node) => node.id));
    assert.equal(nodeIds.size, publishedSnapshot.nodes.length);
    for (const edge of rows.edges) {
      assert.ok(nodeIds.has(edge.source_node_id));
      assert.ok(nodeIds.has(edge.target_node_id));
    }
    assert.equal(rows.edges.length, publishedSnapshot.edges.length);
  });

  it("loads execution graph scoped to a single flow_version_id", async () => {
    const env = createExecutionEnvironment();
    env.flow.status = "draft";
    const first = await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: publishedSnapshot,
    });
    await env.publish.publish(createContext(), {
      flowId: env.flow.id,
      snapshot: republishedSnapshot,
    });

    const queriedVersionIds: string[] = [];
    const trackingGraph: AutomationFlowVersionGraphRepository = {
      materialize: (input) => env.versionGraph.materialize(input),
      hasNode: (flowVersionId, nodeId) => env.versionGraph.hasNode(flowVersionId, nodeId),
      async listExecutionGraph(flowVersionId, flowId) {
        queriedVersionIds.push(flowVersionId);
        return env.versionGraph.listExecutionGraph(flowVersionId, flowId);
      },
    };

    await loadExecutionGraph(env.flow, {
      versions: env.versionRepository,
      versionGraph: trackingGraph,
      versionId: first.version.id,
    });

    assert.deepEqual(queriedVersionIds, [first.version.id]);
  });
});

describe("buildVersionGraphRows", () => {
  it("drops edges that reference missing snapshot nodes", () => {
    const rows = buildVersionGraphRows({
      flowVersionId: "version-1",
      flowId: "flow-1",
      snapshot: {
        ...publishedSnapshot,
        edges: [
          ...publishedSnapshot.edges,
          {
            id: "broken-edge",
            sourceNodeId: "missing-node",
            targetNodeId: "67a3b77c-6feb-446c-bbf3-5e98d2ea9665",
            condition: {},
          },
        ],
      },
    });

    assert.equal(rows.nodes.length, 3);
    assert.equal(rows.edges.length, 2);
  });
});
