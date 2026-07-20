import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AutomationExecutionError,
  AutomationFlowStateError,
  PermissionDeniedError,
} from "../errors.js";
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
import { AutomationEngine } from "./automation-engine.js";
import { createNoopAutomationFlowVersionRepository } from "../lifecycle/test-version-repository.js";
import { createDefaultAutomationNodeRegistry } from "./node-registry.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "automation.execute" || code === "automation.view",
    ...overrides,
  };
}

function createMemoryEnvironment(flowStatus: AutomationFlowRecord["status"] = "active") {
  const flow: AutomationFlowRecord = {
    id: "flow-1",
    company_id: "company-1",
    name: "Test Flow",
    description: "",
    trigger_type: "manual",
    status: flowStatus,
    version: 1,
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

  const nodes: AutomationNodeRecord[] = [];
  const edges: AutomationEdgeRecord[] = [];
  const runs: AutomationRunRecord[] = [];
  const sessions: ConversationSessionRecord[] = [];

  const flowRepository: AutomationFlowRepository = {
    create: async () => flow,
    update: async () => flow,
    updateStatus: async () => flow,
    softDelete: async () => flow,
    findById: async () => flow,
    findByName: async () => null,
    list: async () => [flow],
  };

  const nodeRepository: AutomationNodeRepository = {
    create: async (input) => {
      const record: AutomationNodeRecord = {
        id: `node-${nodes.length + 1}`,
        flow_id: input.flowId,
        type: input.type,
        config: input.config ?? {},
        position_x: input.positionX ?? 0,
        position_y: input.positionY ?? 0,
        created_at: new Date().toISOString(),
      };
      nodes.push(record);
      return record;
    },
    listByFlowId: async () => [...nodes],
    deleteByFlowId: async () => {
      nodes.length = 0;
    },
  };

  const edgeRepository: AutomationEdgeRepository = {
    create: async (input) => {
      const record: AutomationEdgeRecord = {
        id: `edge-${edges.length + 1}`,
        flow_id: input.flowId,
        source_node_id: input.sourceNodeId,
        target_node_id: input.targetNodeId,
        condition: input.condition ?? {},
        created_at: new Date().toISOString(),
      };
      edges.push(record);
      return record;
    },
    listByFlowId: async () => [...edges],
    deleteByFlowId: async () => {
      edges.length = 0;
    },
  };

  const runRepository: AutomationRunRepository = {
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
      if (input.status !== undefined) record.status = input.status;
      if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
      if (input.sessionId !== undefined) record.session_id = input.sessionId;
      if (input.variables !== undefined) record.variables = input.variables;
      if (input.errorMessage !== undefined) record.error_message = input.errorMessage;
      if (input.finishedAt !== undefined) record.finished_at = input.finishedAt;
      return { ...record };
    },
  };

  const sessionRepository: ConversationSessionRepository = {
    create: async (input) => {
      const record: ConversationSessionRecord = {
        id: `session-${sessions.length + 1}`,
        company_id: input.companyId,
        channel: input.channel,
        external_user_id: input.externalUserId ?? null,
        customer_id: input.customerId ?? null,
        flow_id: input.flowId ?? null,
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
      if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
      if (input.runId !== undefined) record.run_id = input.runId;
      if (input.variables !== undefined) record.variables = input.variables;
      record.last_activity_at = input.lastActivityAt ?? new Date().toISOString();
      return { ...record };
    },
  };

  const engine = new AutomationEngine({
    flows: flowRepository,
    nodes: nodeRepository,
    edges: edgeRepository,
    runs: runRepository,
    sessions: sessionRepository,
    versions: createNoopAutomationFlowVersionRepository(),
    registry: createDefaultAutomationNodeRegistry(),
  });

  return { engine, nodes, edges, runs, sessions, nodeRepository, edgeRepository };
}

async function buildLinearSuccessGraph(env: ReturnType<typeof createMemoryEnvironment>) {
  const trigger = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "trigger",
    config: { initialVariables: { greeting: "hello" } },
  });
  const action = await env.nodeRepository.create({
    flowId: "flow-1",
    type: "action",
    config: { action: "set_variable", key: "topic", value: "automation" },
  });
  const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
  await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: action.id });
  await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: action.id, targetNodeId: end.id });
}

describe("AutomationEngine", () => {
  it("executes a linear flow to completion and persists runtime state", async () => {
    const env = createMemoryEnvironment();
    await buildLinearSuccessGraph(env);

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "web_chat",
      initialVariables: { source: "test" },
    });

    assert.equal(result.lifecycle, "completed");
    assert.equal(result.run.status, "completed");
    assert.equal(result.session.status, "completed");
    assert.equal(result.variables.greeting, "hello");
    assert.equal(result.variables.topic, "automation");
    assert.equal(result.variables.source, "test");
    assert.ok(result.run.finished_at);
    assert.equal(env.runs[0]?.session_id, env.sessions[0]?.id);
    assert.equal(env.sessions[0]?.run_id, env.runs[0]?.id);
  });

  it("pauses in waiting_input when an action node requests user input", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const wait = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "wait_for_input", inputKey: "email", prompt: "Enter email" },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: wait.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: wait.id, targetNodeId: end.id });

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "api",
    });

    assert.equal(result.lifecycle, "waiting_input");
    assert.equal(result.run.status, "waiting_input");
    assert.equal(result.session.status, "waiting_input");
    assert.equal(result.variables.__waitingFor, "email");
    assert.equal(result.currentNodeId, wait.id);
  });

  it("marks runs failed when a node requests failure", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const fail = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "fail", message: "Validation failed" },
    });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: fail.id });

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "email",
    });

    assert.equal(result.lifecycle, "failed");
    assert.equal(result.run.status, "failed");
    assert.equal(result.run.error_message, "Validation failed");
  });

  it("resumes a waiting run and completes the flow", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const wait = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "wait_for_input", inputKey: "name" },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: wait.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: wait.id, targetNodeId: end.id });

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "web_chat",
    });

    const resumed = await env.engine.resume(createContext(), {
      runId: waiting.run.id,
      input: { name: "Ada" },
    });

    assert.equal(resumed.lifecycle, "completed");
    assert.equal(resumed.variables.name, "Ada");
    assert.equal(resumed.run.status, "completed");
  });

  it("rejects execution without permission or inactive flows", async () => {
    const env = createMemoryEnvironment("draft");
    await buildLinearSuccessGraph(env);

    await assert.rejects(
      () =>
        env.engine.start(createContext({ hasPermission: () => false }), {
          companyId: "company-1",
          flowId: "flow-1",
          channel: "web_chat",
        }),
      PermissionDeniedError,
    );

    await assert.rejects(
      () =>
        env.engine.start(createContext(), {
          companyId: "company-1",
          flowId: "flow-1",
          channel: "web_chat",
        }),
      AutomationFlowStateError,
    );
  });

  it("cancels a waiting run", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const wait = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "wait_for_input", inputKey: "token" },
    });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: wait.id });

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "web_chat",
    });

    const cancelled = await env.engine.cancel(createContext(), waiting.run.id);
    assert.equal(cancelled.lifecycle, "cancelled");
    assert.equal(cancelled.run.status, "cancelled");
    assert.equal(cancelled.session.status, "cancelled");
  });

  it("rejects resume when run is not waiting for input", async () => {
    const env = createMemoryEnvironment();
    await buildLinearSuccessGraph(env);
    const completed = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "web_chat",
    });

    await assert.rejects(
      () => env.engine.resume(createContext(), { runId: completed.run.id, input: { name: "Late" } }),
      AutomationExecutionError,
    );
  });
});
