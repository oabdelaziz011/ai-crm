import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionNodeHandler, createBuiltInAutomationNodeHandlers } from "./built-in-nodes.js";
import { AutomationEngine } from "./automation-engine.js";
import type { ExecutionContext } from "./execution-context.js";
import { AutomationNodeRegistry } from "./node-registry.js";
import { createNoopAutomationFlowVersionRepository } from "../lifecycle/test-version-repository.js";
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
import {
  createAIWorkflowPlatformServices,
  createDefaultDecisionNodeConfig,
  createDefaultExtractNodeConfig,
  createDefaultKnowledgeSearchNodeConfig,
  createDefaultSummarizerNodeConfig,
  toAIWorkflowEngineConfig,
  wrapAutomationActionHandlerWithAIWorkflow,
  type AIWorkflowAutomationContext,
} from "@workspace/ai-workflow-platform";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "automation.execute" || code === "automation.view",
    ...overrides,
  };
}

function toAIWorkflowAutomationContext(context: ExecutionContext): AIWorkflowAutomationContext {
  return {
    company: { id: context.company.id },
    flow: { id: context.flow.id },
    run: { id: context.run.id },
    session: { id: context.session.id },
    variables: context.variables,
    customer: { id: context.customer.id },
    currentNode: { config: context.currentNode.config },
    input: context.input,
  };
}

function createStubRuntime() {
  return {
    async buildPrompt() {
      throw new Error("buildPrompt is not used in automation integration tests.");
    },
    async execute(_ctx: unknown, input: { templateKey?: string }) {
      if (input.templateKey === "workflow_summarize") {
        return {
          executionId: "exec-summary",
          promptBuildId: "build-summary",
          promptVersionId: "v1",
          templateKey: "workflow_summarize",
          providerKey: "stub",
          model: "stub-model",
          responseText: "Summarized quarterly revenue growth.",
          latencyMs: 12,
          gatewayLatencyMs: 6,
          contextSizeBytes: 64,
          tokenUsage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
          estimatedCostUsd: 0.001,
          cacheHit: false,
        };
      }

      if (input.templateKey === "workflow_extract") {
        return {
          executionId: "exec-extract",
          promptBuildId: "build-extract",
          promptVersionId: "v1",
          templateKey: "workflow_extract",
          providerKey: "stub",
          model: "stub-model",
          responseText: JSON.stringify({
            data: { customer_name: "Jane Doe", email: "jane@example.com" },
            confidence: {
              overall: 0.93,
              fields: { customer_name: 0.95, email: 0.9 },
              warnings: [],
              missingValues: [],
              correctionHints: [],
            },
          }),
          latencyMs: 14,
          gatewayLatencyMs: 7,
          contextSizeBytes: 96,
          tokenUsage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 },
          estimatedCostUsd: 0.002,
          cacheHit: false,
        };
      }

      if (input.templateKey === "workflow_decision") {
        return {
          executionId: "exec-decision",
          promptBuildId: "build-decision",
          promptVersionId: "v1",
          templateKey: "workflow_decision",
          providerKey: "stub",
          model: "stub-model",
          responseText: JSON.stringify({
            label: "sales",
            labels: ["sales"],
            confidence: 0.94,
            score: null,
            reasoning: "Pricing question",
            metadata: {},
          }),
          latencyMs: 11,
          gatewayLatencyMs: 5,
          contextSizeBytes: 88,
          tokenUsage: { prompt_tokens: 24, completion_tokens: 10, total_tokens: 34 },
          estimatedCostUsd: 0.001,
          cacheHit: false,
        };
      }

      throw new Error(`Unexpected template key: ${input.templateKey ?? "unknown"}`);
    },
  };
}

function createAIEnabledEnvironment(channel: ConversationSessionRecord["channel"] = "web_chat") {
  const aiServices = createAIWorkflowPlatformServices({
    registerBuiltIns: true,
    runtime: createStubRuntime(),
    knowledge: {
      async retrieve() {
        return {
          contextText: "Refunds within 30 days.",
          chunks: [
            {
              id: "chunk-1",
              content: "Refunds are available within 30 days of purchase.",
              score: 0.91,
              rank: 1,
              tokenCount: 18,
              documentTitle: "Refund Policy",
              metadata: { documentId: "doc-refund", sourceId: "kb://policies" },
            },
          ],
          chunkCount: 1,
          totalTokens: 18,
          executionId: "exec-knowledge-1",
          vectorQueryExecutionId: "vq-knowledge-1",
          retrievalLatencyMs: 21,
          rankingLatencyMs: 4,
          policyId: "default",
        };
      },
    },
  });

  const bridge = aiServices.createRuntimeBridge(() => ({
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
  }));

  const handlers = createBuiltInAutomationNodeHandlers().map((handler) =>
    handler.type === "action"
      ? wrapAutomationActionHandlerWithAIWorkflow(handler, bridge, toAIWorkflowAutomationContext)
      : handler,
  );
  const registry = new AutomationNodeRegistry().registerMany(handlers);

  const flow: AutomationFlowRecord = {
    id: "flow-1",
    company_id: "company-1",
    name: "AI Integration Flow",
    description: "",
    trigger_type: "manual",
    status: "active",
    version: 1,
    active_version_id: null,
    has_unpublished_draft: false,
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
    registry,
  });

  return {
    engine,
    nodeRepository,
    edgeRepository,
    defaultChannel: channel,
  };
}

async function connectLinear(
  env: ReturnType<typeof createAIEnabledEnvironment>,
  nodeConfigs: Array<{ type: AutomationNodeRecord["type"]; config?: Record<string, unknown> }>,
) {
  const created = [];
  for (const item of nodeConfigs) {
    created.push(
      await env.nodeRepository.create({
        flowId: "flow-1",
        type: item.type,
        config: item.config ?? {},
      }),
    );
  }

  for (let index = 0; index < created.length - 1; index += 1) {
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: created[index]!.id,
      targetNodeId: created[index + 1]!.id,
    });
  }

  return created;
}

function aiNodeConfig(
  buildConfig: () => ReturnType<typeof createDefaultSummarizerNodeConfig>,
): Record<string, unknown> {
  const config = buildConfig();
  config.providerKey = "stub";
  return toAIWorkflowEngineConfig(config);
}

describe("AutomationEngine AI workflow integration", () => {
  it("Workflow A: Text → Summarizer → Finish", async () => {
    const env = createAIEnabledEnvironment();
    await connectLinear(env, [
      { type: "trigger", config: { initialVariables: { input: "Long quarterly report text." } } },
      { type: "action", config: aiNodeConfig(createDefaultSummarizerNodeConfig) },
      { type: "end", config: {} },
    ]);

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: env.defaultChannel,
    });

    assert.equal(result.lifecycle, "completed");
    const summary = result.variables.summary_result as { text: string };
    assert.match(summary.text, /Summarized quarterly revenue growth/);
    assert.equal((result.variables.__aiLastExecution as { providerKey: string }).providerKey, "stub");
  });

  it("Workflow B: Text → Extract → CRM Variable → Finish", async () => {
    const env = createAIEnabledEnvironment();
    await connectLinear(env, [
      { type: "trigger", config: { initialVariables: { input: "Jane Doe at jane@example.com" } } },
      { type: "action", config: aiNodeConfig(createDefaultExtractNodeConfig) },
      {
        type: "action",
        config: { action: "set_variable", key: "crm_contact", value: "{{extract_result.value.data.customer_name}}" },
      },
      { type: "end", config: {} },
    ]);

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: env.defaultChannel,
    });

    assert.equal(result.lifecycle, "completed");
    const extract = result.variables.extract_result as { value: { data: { customer_name: string } } };
    assert.equal(extract.value.data.customer_name, "Jane Doe");
    assert.ok(result.variables.extract_result);
    assert.ok(result.variables.__aiLastExecution);
  });

  it("Workflow C: Message → Decision → If → Finish", async () => {
    const env = createAIEnabledEnvironment();
    const trigger = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "trigger",
      config: { initialVariables: { input: "How much does enterprise cost?" } },
    });
    const decision = await env.nodeRepository.create({
      flowId: "flow-1",
      type: "action",
      config: aiNodeConfig(createDefaultDecisionNodeConfig),
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
                id: "sales-branch",
                field: "decision_result.value.label",
                operator: "equals",
                value: "sales",
              },
            ],
          },
        },
      },
    });
    const end = await env.nodeRepository.create({ flowId: "flow-1", type: "end", config: {} });

    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: trigger.id, targetNodeId: decision.id });
    await env.edgeRepository.create({ flowId: "flow-1", sourceNodeId: decision.id, targetNodeId: condition.id });
    await env.edgeRepository.create({
      flowId: "flow-1",
      sourceNodeId: condition.id,
      targetNodeId: end.id,
      condition: { branch: "yes" },
    });

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: env.defaultChannel,
    });

    assert.equal(result.lifecycle, "completed");
    const decisionResult = result.variables.decision_result as { value: { label: string; confidence: number } };
    assert.equal(decisionResult.value.label, "sales");
    assert.equal(result.variables.__branch, "yes");
  });

  it("Workflow D: Query → Knowledge Search → Summarizer → Finish", async () => {
    const env = createAIEnabledEnvironment();
    const knowledgeConfig = createDefaultKnowledgeSearchNodeConfig();
    knowledgeConfig.knowledge = {
      enabled: true,
      collectionId: "col-policies",
      embeddingConnectionId: "emb-1",
      vectorStoreConnectionId: "vec-1",
      maxChunks: 8,
      similarityThreshold: 0.7,
      queryTemplate: null,
    };

    await connectLinear(env, [
      { type: "trigger", config: { initialVariables: { input: "What is the refund policy?" } } },
      { type: "action", config: toAIWorkflowEngineConfig(knowledgeConfig) },
      { type: "action", config: aiNodeConfig(createDefaultSummarizerNodeConfig) },
      { type: "end", config: {} },
    ]);

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: env.defaultChannel,
    });

    assert.equal(result.lifecycle, "completed");
    assert.ok(result.variables.knowledge_result);
    assert.ok(result.variables.summary_result);
    assert.equal((result.variables.__aiLastExecution as { providerKey: string }).providerKey, "stub");
  });

  it("Workflow E: WhatsApp → Decision → Extract → CRM → Finish", async () => {
    const env = createAIEnabledEnvironment("whatsapp");
    await connectLinear(env, [
      { type: "trigger", config: { initialVariables: { input: "Need pricing for 50 seats" } } },
      { type: "action", config: aiNodeConfig(createDefaultDecisionNodeConfig) },
      { type: "action", config: aiNodeConfig(createDefaultExtractNodeConfig) },
      { type: "action", config: { action: "set_variable", key: "crm_stage", value: "qualified" } },
      { type: "end", config: {} },
    ]);

    const result = await env.engine.start(createContext(), {
      companyId: "company-1",
      flowId: "flow-1",
      channel: "whatsapp",
      externalUserId: "+15551234567",
    });

    assert.equal(result.lifecycle, "completed");
    assert.equal(result.session.channel, "whatsapp");
    assert.ok(result.variables.decision_result);
    assert.ok(result.variables.extract_result);
    assert.equal(result.variables.crm_stage, "qualified");
  });

  it("routes ai_workflow actions through the wrapped automation handler", async () => {
    const aiServices = createAIWorkflowPlatformServices({
      registerBuiltIns: true,
      runtime: createStubRuntime(),
    });
    const bridge = aiServices.createRuntimeBridge(() => ({
      userId: "user-1",
      companyId: "company-1",
      isSuperAdmin: false,
      hasPermission: () => true,
    }));
    const wrapped = wrapAutomationActionHandlerWithAIWorkflow(
      actionNodeHandler,
      bridge,
      toAIWorkflowAutomationContext,
    );

    const config = createDefaultSummarizerNodeConfig();
    config.providerKey = "stub";
    const result = await wrapped.execute({
      company: { id: "company-1" },
      flow: { id: "flow-1" } as ExecutionContext["flow"],
      run: { id: "run-1" } as ExecutionContext["run"],
      session: { id: "session-1" } as ExecutionContext["session"],
      customer: { id: null },
      variables: { input: "Quarterly report" },
      currentNode: {
        id: "node-ai",
        flow_id: "flow-1",
        type: "action",
        config: toAIWorkflowEngineConfig(config),
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
      },
      nodes: [],
      edges: [],
    });

    assert.equal(result.outcome, "continue");
    assert.ok((result.variables as Record<string, unknown>).summary_result);
  });
});
