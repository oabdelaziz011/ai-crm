import type {
  CreateExecutionPolicyInput,
  CreateRuntimeErrorInput,
  CreateRuntimeExecutionInput,
  CreateRuntimeSessionInput,
  CreateRuntimeStepInput,
  ExecutionPolicyRecord,
  RuntimeErrorRecord,
  RuntimeExecutionRecord,
  RuntimeSessionRecord,
  RuntimeStepRecord,
  UpdateExecutionPolicyInput,
} from "../types.js";
import type { RuntimePipelineStage, RuntimeStepStatus } from "../constants.js";

export interface RuntimePolicyRepository {
  findByCompany(companyId: string): Promise<ExecutionPolicyRecord[]>;
  create(input: CreateExecutionPolicyInput): Promise<ExecutionPolicyRecord>;
  update(input: UpdateExecutionPolicyInput): Promise<ExecutionPolicyRecord>;
  archive(policyId: string): Promise<ExecutionPolicyRecord>;
  findById(id: string): Promise<ExecutionPolicyRecord | null>;
  findDefault(companyId: string): Promise<ExecutionPolicyRecord | null>;
}

export interface RuntimeSessionRepository {
  createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRecord>;
  updateStatus(sessionId: string, status: RuntimeSessionRecord["session_status"]): Promise<RuntimeSessionRecord>;
  findSession(id: string): Promise<RuntimeSessionRecord | null>;
  findByConversation(conversationId: string): Promise<RuntimeSessionRecord | null>;
}

export interface RuntimeExecutionRepository {
  createExecution(input: CreateRuntimeExecutionInput): Promise<RuntimeExecutionRecord>;
  updateStatus(executionId: string, status: RuntimeExecutionRecord["execution_status"]): Promise<RuntimeExecutionRecord>;
  completeExecution(
    executionId: string,
    input: {
      executionTimeMs: number;
      intentKey?: string | null;
      providerKey?: string | null;
      promptBuildId?: string | null;
      aiExecutionId?: string | null;
      retrievalExecutionId?: string | null;
      vectorQueryExecutionId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<RuntimeExecutionRecord>;
  failExecution(
    executionId: string,
    input: { executionTimeMs: number; errorMessage: string },
  ): Promise<RuntimeExecutionRecord>;
  findExecution(id: string): Promise<RuntimeExecutionRecord | null>;
  findByCompany(companyId: string): Promise<RuntimeExecutionRecord[]>;
}

export interface RuntimeStepRepository {
  createStep(input: CreateRuntimeStepInput): Promise<RuntimeStepRecord>;
  completeStep(stepId: string, input: { durationMs: number; metadata?: Record<string, unknown> }): Promise<RuntimeStepRecord>;
  skipStep(stepId: string, input?: { metadata?: Record<string, unknown> }): Promise<RuntimeStepRecord>;
  failStep(stepId: string, input: { durationMs: number; metadata?: Record<string, unknown> }): Promise<RuntimeStepRecord>;
  listByExecution(executionId: string): Promise<RuntimeStepRecord[]>;
}

export interface RuntimeErrorRepository {
  saveError(input: CreateRuntimeErrorInput): Promise<RuntimeErrorRecord>;
  listByExecution(executionId: string): Promise<RuntimeErrorRecord[]>;
}
