import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AutomationExecutionError,
  AutomationFlowStateError,
  AutomationGraphError,
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
import { createInMemoryAutomationFlowVersionGraphRepository } from "../lifecycle/test-version-graph-repository.js";
import {
  createInMemoryAutomationFlowVersionRepository,
  createMutableFlowRecord,
  seedPublishedVersionGraph,
} from "../lifecycle/test-version-fixtures.js";
import { createDefaultAutomationNodeRegistry } from "./node-registry.js";
import { AutomationNodeRegistry } from "./node-registry.js";
import { createBuiltInAutomationNodeHandlers } from "./built-in-nodes.js";
import { DefaultCustomerServicePort } from "../ports/customer-service-port.js";
import { InMemoryCustomerRepository } from "../crm/customer/customer-repository-port.js";
import { readOutboundQueue } from "../runtime/outbound-queue.js";

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
  const flow = createMutableFlowRecord({ status: flowStatus });

  const nodes: AutomationNodeRecord[] = [];
  const edges: AutomationEdgeRecord[] = [];
  const runs: AutomationRunRecord[] = [];
  const sessions: ConversationSessionRecord[] = [];
  const versionRepository = createInMemoryAutomationFlowVersionRepository();
  const versionGraph = createInMemoryAutomationFlowVersionGraphRepository();

  const flowRepository: AutomationFlowRepository = {
    create: async () => flow,
    update: async (input) => {
      if (input.name !== undefined) flow.name = input.name;
      if (input.description !== undefined) flow.description = input.description;
      if (input.triggerType !== undefined) flow.trigger_type = input.triggerType;
      if (input.metadata !== undefined) flow.metadata = input.metadata;
      if (input.activeVersionId !== undefined) flow.active_version_id = input.activeVersionId;
      if (input.version !== undefined) flow.version = input.version;
      if (input.hasUnpublishedDraft !== undefined) flow.has_unpublished_draft = input.hasUnpublishedDraft;
      if (input.status !== undefined) flow.status = input.status;
      return flow;
    },
    updateStatus: async (_flowId, status) => {
      flow.status = status;
      return flow;
    },
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
      if (input.status !== undefined) record.status = input.status;
      if (input.flowVersionId !== undefined) record.flow_version_id = input.flowVersionId;
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

  const engine = new AutomationEngine({
    flows: flowRepository,
    runs: runRepository,
    sessions: sessionRepository,
    versions: versionRepository,
    versionGraph,
    registry: createDefaultAutomationNodeRegistry(),
  });

  return {
    engine,
    flow,
    nodes,
    edges,
    runs,
    sessions,
    nodeRepository,
    edgeRepository,
    flowRepository,
    runRepository,
    sessionRepository,
    versionRepository,
    versionGraph,
  };
}

async function publishDraftGraph(env: ReturnType<typeof createMemoryEnvironment>) {
  await seedPublishedVersionGraph({
    flowId: env.flow.id,
    companyId: env.flow.company_id,
    nodes: env.nodes,
    edges: env.edges,
    versions: env.versionRepository,
    versionGraph: env.versionGraph,
    flows: env.flowRepository,
  });
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
  await publishDraftGraph(env);
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
    await publishDraftGraph(env);

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

  it("executes send_message and stores text outbound variables", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const send = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "Welcome to VaultOS" },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: send.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: send.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    assert.equal(result.lifecycle, "completed");
    assert.equal((result.variables.__outbound as { kind?: string; text?: string }).kind, "text");
    assert.equal((result.variables.__outbound as { kind?: string; text?: string }).text, "Welcome to VaultOS");
    assert.equal(result.variables.__prompt, "Welcome to VaultOS");
  });

  it("queues multiple consecutive send_message nodes in execution order", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const first = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "اهلا بيك يا فندم" },
    });
    const second = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "How can I help?" },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: first.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: first.id, targetNodeId: second.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: second.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    const queue = result.variables.__outboundQueue as Array<{ kind?: string; text?: string }>;
    assert.equal(queue.length, 2);
    assert.equal(queue[0]?.text, "اهلا بيك يا فندم");
    assert.equal(queue[1]?.text, "How can I help?");
    assert.equal((result.variables.__outbound as { text?: string }).text, "How can I help?");
  });

  it("queues send_message before interactive buttons without losing the first message", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const welcome = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "Welcome" },
    });
    const buttons = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_buttons",
        message: "Choose an option",
        buttons: [{ id: "book", label: "Book" }],
      },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: welcome.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: welcome.id, targetNodeId: buttons.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: buttons.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    assert.equal(result.lifecycle, "waiting_input");
    const queue = result.variables.__outboundQueue as Array<{ kind?: string; text?: string }>;
    assert.equal(queue.length, 2);
    assert.equal(queue[0]?.kind, "text");
    assert.equal(queue[0]?.text, "Welcome");
    assert.equal(queue[1]?.kind, "buttons");
    assert.equal(queue[1]?.text, "Choose an option");
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
    await publishDraftGraph(env);

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
    await publishDraftGraph(env);

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

    env.flow.status = "draft";
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
    await publishDraftGraph(env);

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

  it("stores conversation button variables when resuming a buttons node", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const buttons = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_buttons",
        message: "Choose an option",
        buttons: [{ id: "booking", label: "Book now" }],
      },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: buttons.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: buttons.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "web_chat",
    });

    assert.equal(waiting.lifecycle, "waiting_input");
    assert.equal(waiting.variables.__waitingFor, "interactive_selection");
    assert.equal((waiting.variables.__outbound as { kind?: string }).kind, "buttons");

    const resumed = await env.engine.resume(createContext(), {
      runId: waiting.run.id,
      input: {
        interactive_selection: "Book now",
        replyId: "booking",
        title: "Book now",
        kind: "interactive_reply",
      },
    });

    assert.equal(resumed.lifecycle, "completed");
    const conversation = resumed.variables.conversation as Record<string, unknown>;
    assert.equal(conversation.last_button_id, "booking");
    assert.equal(conversation.last_button_title, "Book now");
    assert.equal(conversation.last_message, "Book now");
    assert.equal(conversation.last_selection_type, "button");
  });

  it("routes through condition nodes using conversation.last_button_id", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const buttons = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_buttons",
        message: "Choose",
        buttons: [{ id: "booking", label: "Book now" }],
      },
    });
    const condition = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "condition",
      config: {
        ruleSet: {
          root: {
            id: "root",
            combinator: "and",
            rules: [
              {
                id: "r1",
                field: "conversation.last_button_id",
                operator: "equals",
                value: "booking",
              },
            ],
          },
        },
      },
    });
    const endYes = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: { label: "yes" } });
    const endNo = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: { label: "no" } });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: buttons.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: buttons.id, targetNodeId: condition.id });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: condition.id,
      targetNodeId: endYes.id,
      condition: { branchKey: "yes" },
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: condition.id,
      targetNodeId: endNo.id,
      condition: { branchKey: "no" },
    });
    await publishDraftGraph(env);

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "web_chat",
    });

    const resumed = await env.engine.resume(createContext(), {
      runId: waiting.run.id,
      input: { replyId: "booking", title: "Book now", kind: "interactive_reply" },
    });

    assert.equal(resumed.lifecycle, "completed");
    assert.equal(resumed.variables.__branch, "yes");
    assert.equal(resumed.currentNodeId, endYes.id);
  });

  it("returns to main menu without completing the session and allows another selection", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const welcome = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "Welcome!" },
    });
    const buttons = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_buttons",
        message: "Main menu",
        primaryMenu: true,
        buttons: [
          { id: "pricing", label: "Pricing" },
          { id: "support", label: "Support" },
        ],
      },
    });
    const condition = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "condition",
      config: {
        ruleSet: {
          root: {
            id: "root",
            combinator: "and",
            rules: [
              {
                id: "r1",
                field: "conversation.last_button_id",
                operator: "equals",
                value: "support",
              },
            ],
          },
        },
      },
    });
    const supportMessage = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "Call 19666 for support." },
    });
    const returnToMenu = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "return_to_main_menu" },
    });
    const pricingMessage = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "Pricing starts at $200." },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: welcome.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: welcome.id, targetNodeId: buttons.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: buttons.id, targetNodeId: condition.id });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: condition.id,
      targetNodeId: supportMessage.id,
      condition: { branch: "yes" },
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: supportMessage.id,
      targetNodeId: returnToMenu.id,
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: condition.id,
      targetNodeId: pricingMessage.id,
      condition: { branch: "no" },
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: pricingMessage.id,
      targetNodeId: end.id,
    });
    await publishDraftGraph(env);

    const started = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "web_chat",
    });

    assert.equal(started.lifecycle, "waiting_input");
    assert.equal(started.currentNodeId, buttons.id);
    const initialQueue = started.variables.__outboundQueue as Array<{ kind: string; text?: string }>;
    assert.deepEqual(
      initialQueue.map((entry) => entry.text),
      ["Welcome!", "Main menu"],
    );

    const supportTurn = await env.engine.resume(createContext(), {
      runId: started.run.id,
      input: { replyId: "support", title: "Support", kind: "interactive_reply" },
    });

    assert.equal(supportTurn.lifecycle, "waiting_input");
    assert.equal(supportTurn.run.status, "waiting_input");
    assert.equal(supportTurn.session.status, "waiting_input");
    assert.equal(supportTurn.currentNodeId, buttons.id);
    const supportQueue = supportTurn.variables.__outboundQueue as Array<{ kind: string; text?: string }>;
    assert.deepEqual(
      supportQueue.map((entry) => entry.text),
      ["Call 19666 for support.", "Main menu"],
    );

    const pricingTurn = await env.engine.resume(createContext(), {
      runId: started.run.id,
      input: { replyId: "pricing", title: "Pricing", kind: "interactive_reply" },
    });

    assert.equal(pricingTurn.lifecycle, "completed");
    assert.equal(pricingTurn.run.id, started.run.id);
    assert.equal(pricingTurn.session.id, started.session.id);
    const pricingQueue = pricingTurn.variables.__outboundQueue as Array<{ kind: string; text?: string }>;
    assert.deepEqual(
      pricingQueue.map((entry) => entry.text),
      ["Pricing starts at $200."],
    );
  });

  it("preserves waiting session for free-text follow-up after list selection", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const list = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_list",
        title: "Choose a doctor",
        body: "Pick one",
        buttonLabel: "Doctors",
        sections: [{ title: "Doctors", rows: [{ id: "dr3", title: "Dr Three" }] }],
      },
    });
    const waitForReply = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "wait_for_reply", prompt: "Tell us more" },
    });
    const reply = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "Thanks for the details." },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: list.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: list.id, targetNodeId: waitForReply.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: waitForReply.id, targetNodeId: reply.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: reply.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const started = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    assert.equal(started.lifecycle, "waiting_input");
    assert.equal(started.currentNodeId, list.id);
    assert.equal(started.variables.__waitingFor, "interactive_selection");

    const afterListSelection = await env.engine.resume(createContext(), {
      runId: started.run.id,
      input: {
        kind: "interactive_reply",
        replyId: "dr3",
        title: "Dr Three",
        interactionType: "list_reply",
      },
    });

    assert.equal(afterListSelection.lifecycle, "waiting_input");
    assert.equal(afterListSelection.run.status, "waiting_input");
    assert.equal(afterListSelection.session.status, "waiting_input");
    assert.equal(afterListSelection.currentNodeId, waitForReply.id);
    assert.equal(afterListSelection.variables.__waitingFor, "input");
    assert.equal(
      (afterListSelection.variables.conversation as { last_button_id?: string }).last_button_id,
      "dr3",
    );

    const afterHello = await env.engine.resume(createContext(), {
      runId: started.run.id,
      input: { input: "Hello" },
    });

    assert.equal(afterHello.lifecycle, "completed");
    assert.equal(afterHello.run.id, started.run.id);
    assert.equal(afterHello.session.id, started.session.id);
    assert.equal(afterHello.variables.input, "Hello");
    assert.equal(afterHello.variables.__waitingFor, null);
  });

  it("routes through condition nodes after WhatsApp list selection using dr3 id", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const list = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_list",
        title: "Choose a doctor",
        body: "Pick one",
        buttonLabel: "Doctors",
        sections: [{ title: "Doctors", rows: [{ id: "dr3", title: "Dr Three" }] }],
      },
    });
    const condition = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "condition",
      config: {
        ruleSet: {
          root: {
            id: "root",
            combinator: "and",
            rules: [
              {
                id: "r1",
                field: "conversation.last_button_id",
                operator: "equals",
                value: "dr3",
              },
            ],
          },
        },
      },
    });
    const endYes = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: { label: "dr3-selected" } });
    const endNo = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: { label: "other" } });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: list.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: list.id, targetNodeId: condition.id });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: condition.id,
      targetNodeId: endYes.id,
      condition: { branch: "yes" },
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: condition.id,
      targetNodeId: endNo.id,
      condition: { branch: "no" },
    });
    await publishDraftGraph(env);

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    assert.equal(waiting.lifecycle, "waiting_input");
    assert.equal(waiting.currentNodeId, list.id);

    const resumed = await env.engine.resume(createContext(), {
      runId: waiting.run.id,
      input: {
        kind: "interactive_reply",
        replyId: "dr3",
        title: "Dr Three",
        interactionType: "list_reply",
      },
    });

    assert.equal(resumed.lifecycle, "completed");
    assert.equal(resumed.variables.__branch, "yes");
    assert.equal(resumed.currentNodeId, endYes.id);
    assert.equal(resumed.variables.interactive_selection, "dr3");
    const conversation = resumed.variables.conversation as Record<string, unknown>;
    assert.equal(conversation.last_button_id, "dr3");
    assert.equal(conversation.last_button_title, "Dr Three");
    assert.equal(conversation.last_selection_type, "list");
  });

  it("persists waiting pins when reaching a second List node in the same run", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const list1 = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_list",
        title: "Choose Doctor",
        body: "First list",
        buttonLabel: "Doctors",
        sections: [{ title: "Doctors", rows: [{ id: "dr3", title: "Dr Three" }] }],
      },
    });
    const bridge = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "Booking confirmed." },
    });
    const list2 = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_list",
        title: "Choose Doctor",
        body: "Second list",
        buttonLabel: "Doctors",
        sections: [{ title: "Doctors", rows: [{ id: "dr7", title: "Dr Seven" }] }],
      },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: list1.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: list1.id, targetNodeId: bridge.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: bridge.id, targetNodeId: list2.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: list2.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const started = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    const afterFirstSelection = await env.engine.resume(createContext(), {
      runId: started.run.id,
      input: { kind: "interactive_reply", replyId: "dr3", title: "Dr Three" },
    });

    assert.equal(afterFirstSelection.lifecycle, "waiting_input");
    assert.notEqual(afterFirstSelection.lifecycle, "completed");
    assert.equal(afterFirstSelection.run.id, started.run.id);
    assert.equal(afterFirstSelection.currentNodeId, list2.id);
    assert.equal(afterFirstSelection.run.current_node_id, list2.id);
    assert.equal(afterFirstSelection.session.current_node_id, list2.id);
    assert.equal(afterFirstSelection.run.status, "waiting_input");
    assert.equal(afterFirstSelection.session.status, "waiting_input");
    assert.equal(afterFirstSelection.variables.__waitingFor, "interactive_selection");

    const outboundQueue = readOutboundQueue(afterFirstSelection.variables);
    assert.ok(outboundQueue.length >= 2);
    assert.equal(outboundQueue[outboundQueue.length - 1]?.kind, "list");
    assert.equal(outboundQueue[outboundQueue.length - 1]?.body, "Second list");

    const afterHello = await env.engine.resume(createContext(), {
      runId: started.run.id,
      input: { input: "Hello" },
    });

    assert.equal(afterHello.run.id, started.run.id);
    assert.equal(afterHello.lifecycle, "waiting_input");
    assert.equal(afterHello.currentNodeId, list2.id);
    assert.equal(afterHello.run.current_node_id, list2.id);
  });

  it("routes button replies through Switch to the matching business flow", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const buttons = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_buttons",
        message: "Choose",
        buttons: [
          { id: "book", label: "Book Appointment" },
          { id: "pricing", label: "Pricing" },
          { id: "support", label: "Support" },
        ],
      },
    });
    const switchNode = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "condition",
      config: {
        mode: "switch",
        field: "conversation.last_button_id",
        cases: [
          { id: "book", label: "Book Appointment", value: "book" },
          { id: "pricing", label: "Pricing", value: "pricing" },
          { id: "support", label: "Support", value: "support" },
        ],
        includeDefault: true,
      },
    });
    const bookFlow = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "What is your phone number?" },
    });
    const pricingFlow = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "Pricing starts at $200." },
    });
    const supportFlow = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "For support please call :19666" },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: buttons.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: buttons.id, targetNodeId: switchNode.id });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: switchNode.id,
      targetNodeId: bookFlow.id,
      condition: { case: "book" },
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: switchNode.id,
      targetNodeId: pricingFlow.id,
      condition: { case: "pricing" },
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: switchNode.id,
      targetNodeId: supportFlow.id,
      condition: { case: "support" },
    });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: bookFlow.id, targetNodeId: end.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: pricingFlow.id, targetNodeId: end.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: supportFlow.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    const bookTurn = await env.engine.resume(createContext(), {
      runId: waiting.run.id,
      input: { kind: "interactive_reply", replyId: "book", title: "Book Appointment" },
    });
    assert.match(
      readOutboundQueue(bookTurn.variables).map((entry) => entry.text).join(" "),
      /phone number/i,
    );

    const pricingWaiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });
    const pricingTurn = await env.engine.resume(createContext(), {
      runId: pricingWaiting.run.id,
      input: { kind: "interactive_reply", replyId: "pricing", title: "Pricing" },
    });
    assert.match(
      readOutboundQueue(pricingTurn.variables).map((entry) => entry.text).join(" "),
      /\$200/,
    );

    const supportWaiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });
    const supportTurn = await env.engine.resume(createContext(), {
      runId: supportWaiting.run.id,
      input: { kind: "interactive_reply", replyId: "support", title: "Support" },
    });
    assert.match(
      readOutboundQueue(supportTurn.variables).map((entry) => entry.text).join(" "),
      /19666/,
    );
  });

  it("rejects legacy parallel If/Else branches after button selection", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const buttons = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_buttons",
        message: "Choose",
        buttons: [
          { id: "book", label: "Book Appointment" },
          { id: "pricing", label: "Pricing" },
        ],
      },
    });
    const pricingIf = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "condition",
      config: {
        ruleSet: {
          root: {
            id: "root",
            combinator: "and",
            rules: [{ id: "r1", field: "conversation.last_button_title", operator: "equals", value: "Pricing" }],
          },
        },
      },
    });
    const bookIf = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "condition",
      config: {
        ruleSet: {
          root: {
            id: "root",
            combinator: "and",
            rules: [{ id: "r1", field: "conversation.last_button_id", operator: "equals", value: "book" }],
          },
        },
      },
    });
    const support = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "For support please call :19666" },
    });
    const booking = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: { action: "send_message", message: "What is your phone number?" },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: buttons.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: buttons.id, targetNodeId: pricingIf.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: buttons.id, targetNodeId: bookIf.id });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: pricingIf.id,
      targetNodeId: support.id,
      condition: { branch: "no" },
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: bookIf.id,
      targetNodeId: booking.id,
      condition: { branch: "yes" },
    });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: support.id, targetNodeId: end.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: booking.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    await assert.rejects(
      () =>
        env.engine.resume(createContext(), {
          runId: waiting.run.id,
          input: { kind: "interactive_reply", replyId: "book", title: "Book Appointment" },
        }),
      AutomationGraphError,
    );
  });

  it("routes list replies through Switch including 100+ cases", async () => {
    const env = createMemoryEnvironment();
    const cases = Array.from({ length: 120 }, (_, index) => ({
      id: `opt-${index + 1}`,
      label: `Option ${index + 1}`,
      value: `opt-${index + 1}`,
    }));
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const list = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_list",
        title: "Choose",
        body: "Pick one",
        buttonLabel: "Options",
        sections: [{ title: "Options", rows: cases.map((item) => ({ id: item.id, title: item.label })) }],
      },
    });
    const switchNode = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "condition",
      config: { mode: "switch", field: "conversation.last_button_id", cases, includeDefault: false },
    });
    const matchedEnd = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: { label: "matched" } });
    const defaultEnd = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: { label: "default" } });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: list.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: list.id, targetNodeId: switchNode.id });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: switchNode.id,
      targetNodeId: matchedEnd.id,
      condition: { case: "opt-120" },
    });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: switchNode.id,
      targetNodeId: defaultEnd.id,
      condition: { case: "default" },
    });
    await publishDraftGraph(env);

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    const resumed = await env.engine.resume(createContext(), {
      runId: waiting.run.id,
      input: { kind: "interactive_reply", replyId: "opt-120", title: "Option 120", interactionType: "list_reply" },
    });

    assert.equal(resumed.lifecycle, "completed");
    assert.equal(resumed.currentNodeId, matchedEnd.id);
    assert.equal(resumed.variables.__switchCase, "opt-120");
  });

  it("persists list selection to workflow variable and passes it to create customer gender", async () => {
    const env = createMemoryEnvironment();
    const customerRepository = new InMemoryCustomerRepository();
    const customerService = new DefaultCustomerServicePort(customerRepository);
    const registry = new AutomationNodeRegistry().registerMany(
      createBuiltInAutomationNodeHandlers({ customerService }),
    );
    const engine = new AutomationEngine({
      flows: env.flowRepository,
      runs: env.runRepository,
      sessions: env.sessionRepository,
      versions: env.versionRepository,
      versionGraph: env.versionGraph,
      registry,
    });

    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const list = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_list",
        inputKey: "customer_gender",
        title: "What is your gender?",
        body: "Please choose one option",
        buttonLabel: "Options",
        sections: [
          {
            title: "Gender",
            rows: [
              { id: "male", title: "Male" },
              { id: "female", title: "Female", value: "female" },
            ],
          },
        ],
      },
    });
    const createCustomer = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "create_customer",
        nameField: "customer_name",
        genderField: "customer_gender",
      },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: list.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: list.id, targetNodeId: createCustomer.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: createCustomer.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const waiting = await engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
      initialVariables: { customer_name: "Nessma Hossam" },
    });

    assert.equal(waiting.lifecycle, "waiting_input");
    assert.equal(waiting.currentNodeId, list.id);

    const runRecord = env.runs.find((entry) => entry.id === waiting.run.id);
    if (runRecord) {
      runRecord.metadata = { ...runRecord.metadata, actorUserId: "user-1" };
    }

    const afterSelection = await engine.resume(createContext(), {
      runId: waiting.run.id,
      input: {
        kind: "interactive_reply",
        replyId: "male",
        title: "Male",
        interactionType: "list_reply",
      },
    });

    assert.equal(afterSelection.variables.customer_gender, "male");
    assert.equal(afterSelection.lifecycle, "completed");
    const created = customerRepository.list();
    assert.equal(created.length, 1);
    assert.equal(created[0]?.gender, "male");
    assert.equal(created[0]?.name, "Nessma Hossam");
  });

  it("does not create workflow variables when list inputKey is unset", async () => {
    const env = createMemoryEnvironment();
    const trigger = await env.nodeRepository.create({ flowId: "flow-1", type: "trigger", config: {} });
    const list = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: {
        action: "send_list",
        title: "Choose",
        body: "Pick one",
        buttonLabel: "Options",
        sections: [{ title: "Options", rows: [{ id: "male", title: "Male" }] }],
      },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: list.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: list.id, targetNodeId: end.id });
    await publishDraftGraph(env);

    const waiting = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
    });

    const resumed = await env.engine.resume(createContext(), {
      runId: waiting.run.id,
      input: { kind: "interactive_reply", replyId: "male", title: "Male", interactionType: "list_reply" },
    });

    assert.equal(resumed.lifecycle, "completed");
    assert.equal(resumed.variables.customer_gender, undefined);
    assert.equal((resumed.variables.conversation as { last_button_id?: string }).last_button_id, "male");
  });
});
