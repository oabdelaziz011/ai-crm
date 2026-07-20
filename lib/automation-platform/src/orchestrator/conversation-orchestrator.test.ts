import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AutomationChannel, OrchestratorTriggerType } from "../constants.js";
import { OrchestratorTriggerNotFoundError } from "../errors.js";
import { InMemoryCustomerResolver } from "../ports/customer-resolver-port.js";
import type {
  AutomationEdgeRepository,
  AutomationFlowRepository,
  AutomationNodeRepository,
  AutomationRunRepository,
  ConversationMessageRepository,
  ConversationSessionRepository,
} from "../repositories/automation-repositories.js";
import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
  AutomationRunRecord,
  ConversationMessageRecord,
  ConversationSessionRecord,
  ServiceContext,
} from "../types.js";
import { AutomationEngine } from "../engine/automation-engine.js";
import { createNoopAutomationFlowVersionRepository } from "../lifecycle/test-version-repository.js";
import { createDefaultAutomationNodeRegistry } from "../engine/node-registry.js";
import { createDefaultChannelAdapterRegistry } from "./channel-adapter.js";
import { ConversationOrchestrator } from "./conversation-orchestrator.js";
import { mapOrchestratorTriggerToFlowTrigger } from "./conversation-resolver.js";
import { buildResumeInput, canResumeWaitingRun, isSessionExpired } from "./session-policy.js";
import { TriggerDispatcher } from "./trigger-dispatcher.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "automation.execute" || code === "automation.view",
    ...overrides,
  };
}

function createEnvironment(options?: {
  inboundFlowStatus?: AutomationFlowRecord["status"];
  manualFlowId?: string;
}) {
  const flows: AutomationFlowRecord[] = [
    {
      id: "flow-inbound",
      company_id: "company-1",
      name: "Inbound Flow",
      description: "",
      trigger_type: "inbound_message",
      status: options?.inboundFlowStatus ?? "active",
      version: 1,
      active_version_id: null,
      has_unpublished_draft: false,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    },
    {
      id: options?.manualFlowId ?? "flow-manual",
      company_id: "company-1",
      name: "Manual Flow",
      description: "",
      trigger_type: "manual",
      status: "active",
      version: 1,
      active_version_id: null,
      has_unpublished_draft: false,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    },
    {
      id: "flow-api",
      company_id: "company-1",
      name: "API Flow",
      description: "",
      trigger_type: "api_event",
      status: "active",
      version: 1,
      active_version_id: null,
      has_unpublished_draft: false,
      metadata: {},
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    },
  ];

  const nodes: AutomationNodeRecord[] = [];
  const edges: AutomationEdgeRecord[] = [];
  const runs: AutomationRunRecord[] = [];
  const sessions: ConversationSessionRecord[] = [];
  const messages: ConversationMessageRecord[] = [];

  const flowRepository: AutomationFlowRepository = {
    create: async (input) => {
      const record: AutomationFlowRecord = {
        id: `flow-${flows.length + 1}`,
        company_id: input.companyId,
        name: input.name,
        description: input.description ?? "",
        trigger_type: input.triggerType,
        status: "draft",
        version: 1,
        active_version_id: null,
        has_unpublished_draft: true,
        metadata: input.metadata ?? {},
        created_by: input.createdBy ?? null,
        updated_by: input.createdBy ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        deleted_by: null,
      };
      flows.push(record);
      return record;
    },
    update: async () => flows[0]!,
    updateStatus: async () => flows[0]!,
    softDelete: async () => flows[0]!,
    findById: async (id) => flows.find((flow) => flow.id === id && !flow.deleted_at) ?? null,
    findByName: async () => null,
    list: async (filter) =>
      flows.filter(
        (flow) =>
          flow.company_id === filter.companyId &&
          !flow.deleted_at &&
          (!filter.status || flow.status === filter.status) &&
          (!filter.triggerType || flow.trigger_type === filter.triggerType),
      ),
  };

  const nodeRepository: AutomationNodeRepository = {
    create: async (input) => {
      const record: AutomationNodeRecord = {
        id: `node-${nodes.length + 1}`,
        flow_id: input.flowId,
        type: input.type,
        config: input.config ?? {},
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      };
      nodes.push(record);
      return record;
    },
    listByFlowId: async (flowId) => nodes.filter((node) => node.flow_id === flowId),
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
    listByFlowId: async (flowId) => edges.filter((edge) => edge.flow_id === flowId),
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
    findById: async (id) => runs.find((run) => run.id === id) ?? null,
    findBySessionId: async (sessionId) => runs.find((run) => run.session_id === sessionId) ?? null,
    list: async () => [...runs],
    updateState: async (input) => {
      const record = runs.find((run) => run.id === input.runId)!;
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
    findById: async (id) => sessions.find((session) => session.id === id) ?? null,
    findActiveSession: async (input) =>
      sessions.find(
        (session) =>
          session.company_id === input.companyId &&
          session.channel === input.channel &&
          session.external_user_id === input.externalUserId &&
          ["active", "running", "waiting_input", "paused"].includes(session.status),
      ) ?? null,
    list: async () => [...sessions],
    updateState: async (input) => {
      const record = sessions.find((session) => session.id === input.sessionId)!;
      if (input.status !== undefined) record.status = input.status;
      if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
      if (input.runId !== undefined) record.run_id = input.runId;
      if (input.variables !== undefined) record.variables = input.variables;
      record.last_activity_at = input.lastActivityAt ?? new Date().toISOString();
      return { ...record };
    },
  };

  const messageRepository: ConversationMessageRepository = {
    create: async (input) => {
      const record: ConversationMessageRecord = {
        id: `message-${messages.length + 1}`,
        session_id: input.sessionId,
        sender_type: input.senderType,
        message_type: input.messageType ?? "text",
        payload: input.payload ?? {},
        created_at: new Date().toISOString(),
      };
      messages.push(record);
      return record;
    },
    list: async (filter) => messages.filter((message) => message.session_id === filter.sessionId),
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

  const customers = new InMemoryCustomerResolver();
  customers.seed("company-1", "web_chat", "user-42", "customer-42");

  const orchestrator = new ConversationOrchestrator({
    adapters: createDefaultChannelAdapterRegistry(),
    flows: flowRepository,
    sessions: sessionRepository,
    runs: runRepository,
    messages: messageRepository,
    customers,
    engine,
    policy: { timeoutMs: 60_000, allowResumeWhileWaiting: true, expireInactiveSessions: true },
  });

  return {
    orchestrator,
    engine,
    dispatcher: new TriggerDispatcher({ flows: flowRepository, engine }),
    nodeRepository,
    edgeRepository,
    runs,
    sessions,
    messages,
    flows,
  };
}

async function buildWaitFlow(env: ReturnType<typeof createEnvironment>, flowId = "flow-inbound") {
  const trigger = await env.nodeRepository.create({ flowId, type: "trigger", config: {} });
  const wait = await env.nodeRepository.create({
    flowId,
    type: "action",
    config: { action: "wait_for_input", inputKey: "email", prompt: "What is your email?" },
  });
  const end = await env.nodeRepository.create({ flowId, type: "end", config: {} });
  await env.edgeRepository.create({ flowId, sourceNodeId: trigger.id, targetNodeId: wait.id });
  await env.edgeRepository.create({ flowId, sourceNodeId: wait.id, targetNodeId: end.id });
}

async function buildLinearFlow(env: ReturnType<typeof createEnvironment>, flowId: string) {
  const trigger = await env.nodeRepository.create({ flowId, type: "trigger", config: {} });
  const end = await env.nodeRepository.create({ flowId, type: "end", config: {} });
  await env.edgeRepository.create({ flowId, sourceNodeId: trigger.id, targetNodeId: end.id });
}

describe("session-policy", () => {
  it("detects expired sessions and resume eligibility", () => {
    const session: ConversationSessionRecord = {
      id: "s1",
      company_id: "company-1",
      channel: "web_chat",
      external_user_id: "u1",
      customer_id: null,
      flow_id: "f1",
      run_id: "r1",
      current_node_id: "n1",
      status: "waiting_input",
      started_at: new Date(Date.now() - 120_000).toISOString(),
      last_activity_at: new Date(Date.now() - 120_000).toISOString(),
      metadata: {},
      variables: {},
    };
    const run: AutomationRunRecord = {
      id: "r1",
      company_id: "company-1",
      flow_id: "f1",
      status: "waiting_input",
      trigger_source: "new_conversation",
      started_at: new Date().toISOString(),
      finished_at: null,
      error_message: null,
      metadata: {},
      current_node_id: "n1",
      session_id: "s1",
      variables: { __waitingFor: "email" },
    };

    assert.equal(isSessionExpired(session, new Date(), 60_000), true);
    assert.equal(canResumeWaitingRun(session, run), true);
    assert.deepEqual(buildResumeInput(run, "ada@vaultos.local", {}), { email: "ada@vaultos.local" });
  });
});

describe("TriggerDispatcher", () => {
  it("maps orchestrator triggers and starts matching flows", async () => {
    const env = createEnvironment();
    await buildLinearFlow(env, "flow-manual");

    const triggers: OrchestratorTriggerType[] = ["manual_start", "api_trigger", "new_conversation", "incoming_message"];
    const expected = ["manual", "api_event", "inbound_message", "inbound_message"];
    triggers.forEach((trigger, index) => {
      assert.equal(mapOrchestratorTriggerToFlowTrigger(trigger), expected[index]);
    });

    const manual = await env.dispatcher.dispatch(createContext(), {
      companyId: "company-1",
      channel: "api",
      trigger: "manual_start",
      flowId: "flow-manual",
    });
    assert.equal(manual.lifecycle, "completed");
  });

  it("throws when no active flow matches trigger", async () => {
    const env = createEnvironment({ inboundFlowStatus: "draft" });
    await assert.rejects(
      () =>
        env.dispatcher.dispatch(createContext(), {
          companyId: "company-1",
          channel: "web_chat",
          trigger: "new_conversation",
        }),
      OrchestratorTriggerNotFoundError,
    );
  });
});

describe("ConversationOrchestrator", () => {
  it("starts a new conversation from inbound web chat messages", async () => {
    const env = createEnvironment();
    await buildLinearFlow(env, "flow-inbound");

    const result = await env.orchestrator.handleInbound(createContext(), {
      companyId: "company-1",
      channel: "web_chat",
      rawMessage: { externalUserId: "user-42", text: "Hello" },
    });

    assert.equal(result.execution?.lifecycle, "completed");
    assert.equal(result.resolution.customerId, "customer-42");
    assert.equal(result.inbound.text, "Hello");
    assert.ok(env.messages.length >= 1);
  });

  it("resumes a waiting flow when a follow-up message arrives", async () => {
    const env = createEnvironment();
    await buildWaitFlow(env);

    const first = await env.orchestrator.handleInbound(createContext(), {
      companyId: "company-1",
      channel: "web_chat",
      rawMessage: { externalUserId: "user-42", text: "Hello" },
    });
    assert.equal(first.execution?.lifecycle, "waiting_input");
    assert.equal(first.outboundMessages[0]?.text, "What is your email?");

    const second = await env.orchestrator.handleInbound(createContext(), {
      companyId: "company-1",
      channel: "web_chat",
      rawMessage: { externalUserId: "user-42", text: "ada@vaultos.local" },
    });
    assert.equal(second.execution?.lifecycle, "completed");
    assert.equal(second.execution?.variables.email, "ada@vaultos.local");
    assert.equal(second.resolution.created, false);
  });

  it("expires stale sessions and starts a new conversation", async () => {
    const env = createEnvironment();
    await buildWaitFlow(env);

    const first = await env.orchestrator.handleInbound(createContext(), {
      companyId: "company-1",
      channel: "web_chat",
      rawMessage: { externalUserId: "user-99", text: "Hello" },
    });
    assert.equal(first.execution?.lifecycle, "waiting_input");

    const staleSession = env.sessions.find((session) => session.external_user_id === "user-99")!;
    staleSession.last_activity_at = new Date(Date.now() - 120_000).toISOString();

    const second = await env.orchestrator.handleInbound(createContext(), {
      companyId: "company-1",
      channel: "web_chat",
      rawMessage: { externalUserId: "user-99", text: "Hello again" },
    });

    assert.equal(second.resolution.expired, true);
    assert.equal(second.execution?.lifecycle, "waiting_input");
    assert.notEqual(second.execution?.session.id, staleSession.id);
  });

  it("supports manual and API triggers", async () => {
    const env = createEnvironment();
    await buildLinearFlow(env, "flow-manual");
    await buildLinearFlow(env, "flow-api");

    const manual = await env.orchestrator.startManual(createContext(), {
      companyId: "company-1",
      channel: "api",
      flowId: "flow-manual",
      externalUserId: "manual-user",
    });
    assert.equal(manual.lifecycle, "completed");

    const api = await env.orchestrator.triggerApi(createContext(), {
      companyId: "company-1",
      channel: "api",
      flowId: "flow-api",
      externalUserId: "api-user",
      initialVariables: { requestId: "req-1" },
    });
    assert.equal(api.lifecycle, "completed");
    assert.equal(api.variables.requestId, "req-1");
  });

  it("normalizes inbound payloads through channel adapters", async () => {
    const env = createEnvironment();
    const adapter = env.orchestrator.getAdapter("email");
    const normalized = adapter.normalize(
      { externalUserId: "email-user", text: "Need help", customerId: "cust-1" },
      "company-1",
    );
    assert.equal(normalized.channel, "email");
    assert.equal(normalized.companyId, "company-1");
    assert.equal(normalized.customerId, "cust-1");
  });
});
