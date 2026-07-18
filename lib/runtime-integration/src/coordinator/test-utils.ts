import type { RuntimeEnginePorts } from "../ports/runtime-ports.js";
import type { RuntimeTelemetryPort } from "../ports/observability-port.js";
import type {
  RuntimeErrorRepository,
  RuntimeExecutionRepository,
  RuntimeSessionRepository,
  RuntimeStepRepository,
} from "../repositories/runtime-repositories.js";
import { EnterpriseRuntimeCoordinator } from "./enterprise-runtime-coordinator.js";
import { RuntimePolicyEngine } from "../engines/runtime-policy-engine.js";
import type {
  ExecutionPolicyRecord,
  RuntimeErrorRecord,
  RuntimeExecutionRecord,
  RuntimeSessionRecord,
  RuntimeStepRecord,
  ServiceContext,
} from "../types.js";
import type { RuntimePolicyRepository } from "../repositories/runtime-repositories.js";

export function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => ["runtime.view", "runtime.execute", "runtime.manage"].includes(code),
    ...overrides,
  };
}

export function createTestEnvironment() {
  const policies: ExecutionPolicyRecord[] = [
    {
      id: "policy-1",
      company_id: "company-1",
      policy_name: "default",
      knowledge_retrieval_enabled: true,
      max_pipeline_duration_ms: 120000,
      metadata: {},
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const sessions: RuntimeSessionRecord[] = [];
  const executions: RuntimeExecutionRecord[] = [];
  const steps: RuntimeStepRecord[] = [];
  const errors: RuntimeErrorRecord[] = [];
  const telemetryEvents: Array<Record<string, unknown>> = [];

  const policyRepository: RuntimePolicyRepository = {
    findByCompany: async (companyId) => policies.filter((p) => p.company_id === companyId),
    create: async (input) => {
      const record: ExecutionPolicyRecord = {
        id: `policy-${policies.length + 1}`,
        company_id: input.companyId,
        policy_name: input.policyName,
        knowledge_retrieval_enabled: input.knowledgeRetrievalEnabled ?? true,
        max_pipeline_duration_ms: input.maxPipelineDurationMs ?? 120000,
        metadata: input.metadata ?? {},
        is_default: input.isDefault ?? false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      policies.push(record);
      return record;
    },
    update: async (input) => {
      const record = policies.find((p) => p.id === input.policyId)!;
      Object.assign(record, {
        policy_name: input.policyName ?? record.policy_name,
        knowledge_retrieval_enabled: input.knowledgeRetrievalEnabled ?? record.knowledge_retrieval_enabled,
        max_pipeline_duration_ms: input.maxPipelineDurationMs ?? record.max_pipeline_duration_ms,
        metadata: input.metadata ?? record.metadata,
      });
      return record;
    },
    archive: async (policyId) => {
      const record = policies.find((p) => p.id === policyId)!;
      record.metadata = { ...record.metadata, archived: true };
      return record;
    },
    findById: async (id) => policies.find((p) => p.id === id) ?? null,
    findDefault: async (companyId) => policies.find((p) => p.company_id === companyId && p.is_default) ?? null,
  };

  const sessionRepository: RuntimeSessionRepository = {
    createSession: async (input) => {
      const record: RuntimeSessionRecord = {
        id: `session-${sessions.length + 1}`,
        company_id: input.companyId,
        conversation_id: input.conversationId,
        session_status: "active",
        correlation_id: input.correlationId ?? null,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      sessions.push(record);
      return record;
    },
    updateStatus: async (sessionId, status) => {
      const record = sessions.find((s) => s.id === sessionId)!;
      record.session_status = status;
      return record;
    },
    findSession: async (id) => sessions.find((s) => s.id === id) ?? null,
    findByConversation: async () => null,
  };

  const executionRepository: RuntimeExecutionRepository = {
    createExecution: async (input) => {
      const record: RuntimeExecutionRecord = {
        id: `exec-${executions.length + 1}`,
        company_id: input.companyId,
        session_id: input.sessionId,
        conversation_id: input.conversationId,
        policy_id: input.policyId ?? null,
        execution_status: "running",
        intent_key: null,
        provider_key: null,
        prompt_build_id: null,
        ai_execution_id: null,
        retrieval_execution_id: null,
        vector_query_execution_id: null,
        execution_time_ms: null,
        correlation_id: input.correlationId ?? null,
        error_message: null,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      executions.push(record);
      return record;
    },
    updateStatus: async (executionId, status) => {
      const record = executions.find((e) => e.id === executionId)!;
      record.execution_status = status;
      return record;
    },
    completeExecution: async (executionId, input) => {
      const record = executions.find((e) => e.id === executionId)!;
      Object.assign(record, {
        execution_status: "completed",
        execution_time_ms: input.executionTimeMs,
        intent_key: input.intentKey ?? record.intent_key,
        provider_key: input.providerKey ?? record.provider_key,
        prompt_build_id: input.promptBuildId ?? record.prompt_build_id,
        ai_execution_id: input.aiExecutionId ?? record.ai_execution_id,
        retrieval_execution_id: input.retrievalExecutionId ?? record.retrieval_execution_id,
        vector_query_execution_id: input.vectorQueryExecutionId ?? record.vector_query_execution_id,
        metadata: input.metadata ?? record.metadata,
      });
      return record;
    },
    failExecution: async (executionId, input) => {
      const record = executions.find((e) => e.id === executionId)!;
      Object.assign(record, {
        execution_status: "failed",
        execution_time_ms: input.executionTimeMs,
        error_message: input.errorMessage,
      });
      return record;
    },
    findExecution: async (id) => executions.find((e) => e.id === id) ?? null,
    findByCompany: async (companyId) => executions.filter((e) => e.company_id === companyId),
  };

  const stepRepository: RuntimeStepRepository = {
    createStep: async (input) => {
      const record: RuntimeStepRecord = {
        id: `step-${steps.length + 1}`,
        execution_id: input.executionId,
        stage: input.stage,
        step_status: "running",
        duration_ms: null,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      steps.push(record);
      return record;
    },
    completeStep: async (stepId, input) => {
      const record = steps.find((s) => s.id === stepId)!;
      record.step_status = "completed";
      record.duration_ms = input.durationMs;
      return record;
    },
    skipStep: async (stepId, input) => {
      const record = steps.find((s) => s.id === stepId)!;
      record.step_status = "skipped";
      record.duration_ms = 0;
      record.metadata = { ...record.metadata, ...(input?.metadata ?? {}) };
      return record;
    },
    failStep: async (stepId, input) => {
      const record = steps.find((s) => s.id === stepId)!;
      record.step_status = "failed";
      record.duration_ms = input.durationMs;
      return record;
    },
    listByExecution: async (executionId) => steps.filter((s) => s.execution_id === executionId),
  };

  const errorRepository: RuntimeErrorRepository = {
    saveError: async (input) => {
      const record: RuntimeErrorRecord = {
        id: `error-${errors.length + 1}`,
        execution_id: input.executionId,
        step_id: input.stepId ?? null,
        error_code: input.errorCode,
        error_category: input.errorCategory,
        human_message: input.humanMessage,
        developer_message: input.developerMessage,
        correlation_id: input.correlationId ?? null,
        recoverable: input.recoverable ?? false,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
      };
      errors.push(record);
      return record;
    },
    listByExecution: async (executionId) => errors.filter((e) => e.execution_id === executionId),
  };

  const messages: Array<{ role: "customer" | "assistant"; content: string }> = [];

  const ports: RuntimeEnginePorts = {
    conversation: {
      findConversation: async (conversationId) => ({
        id: conversationId,
        companyId: "company-1",
        state: "collecting_information",
        metadata: {},
      }),
      listRecentMessages: async () =>
        messages.map((message, index) => ({
          id: `msg-${index}`,
          role: message.role,
          content: message.content,
          createdAt: new Date().toISOString(),
        })),
      addIncomingMessage: async (_ctx, input) => {
        messages.push({ role: "customer", content: input.content });
        return { id: `msg-in-${messages.length}`, role: "customer", content: input.content, createdAt: new Date().toISOString() };
      },
      addOutgoingMessage: async (_ctx, input) => {
        messages.push({ role: "assistant", content: input.content });
        return { id: `msg-out-${messages.length}`, role: "assistant", content: input.content, createdAt: new Date().toISOString() };
      },
    },
    state: {
      getCurrentState: async () => "collecting_information",
    },
    intent: {
      resolveIntent: async () => ({
        intentKey: "general_question",
        confidence: 0.91,
        matchedTool: null,
        reason: "keyword match",
        requiresHuman: false,
        requiresLlm: true,
        status: "matched",
      }),
    },
    retrieval: {
      runRetrieval: async () => ({
        vectorQueryExecutionId: "vq-exec-1",
        retrieval: {
          executionId: "retrieval-exec-1",
          contextId: "context-1",
          chunkCount: 1,
          totalTokens: 20,
          chunks: [{ content: "Security policy requires MFA.", metadata: { documentTitle: "Security Policy" } }],
        },
      }),
    },
    prompt: {
      buildPrompt: async () => ({
        buildId: "prompt-build-1",
        templateKey: "conversation_default",
        finalPrompt: "System: You are helpful.\nUser: Hello",
      }),
    },
    execution: {
      execute: async () => ({
        executionId: "ai-exec-1",
        providerKey: "stub",
        model: "stub-model",
        status: "completed",
        latencyMs: 42,
        tokenUsage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
        responseContent: "Hello! How can I help you today?",
      }),
    },
    provider: {
      resolveProvider: async () => ({ providerKey: "stub", connectionId: "conn-1" }),
    },
  };

  const telemetryPort: RuntimeTelemetryPort = {
    recordExecution: async (event) => {
      telemetryEvents.push(event as unknown as Record<string, unknown>);
    },
  };

  const policy = new RuntimePolicyEngine(policyRepository);
  const coordinator = new EnterpriseRuntimeCoordinator(
    ports,
    policy,
    sessionRepository,
    executionRepository,
    stepRepository,
    errorRepository,
    telemetryPort,
  );

  return {
    policies,
    sessions,
    executions,
    steps,
    errors,
    telemetryEvents,
    messages,
    policy,
    coordinator,
    ports,
  };
}
