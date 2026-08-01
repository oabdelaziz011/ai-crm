import type { AgentRuntimeChannelBinding } from "../adapters/ai-employee-runtime-types";

export const AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY = "employeeExecutionContext";

export type AgentEmployeeExecutionPolicy = AgentRuntimeChannelBinding["executionPolicy"];

export type AgentEmployeeKnowledgeRetrieval = AgentRuntimeChannelBinding["knowledgeRetrieval"];

/**
 * Immutable runtime snapshot for an AI Employee bound to a workflow or chat conversation.
 *
 * Created once when binding succeeds at start (workflow or first employee chat message).
 * Stored on pageContext and reused for all subsequent runtime calls in that execution.
 *
 * ## Unpublish during execution
 *
 * If an employee is unpublished or demoted to draft while a workflow or chat session is
 * already running, the frozen {@link AgentEmployeeExecutionContext} is **not** invalidated.
 * The in-flight execution continues with the tool scope, provider, and knowledge config
 * captured at bind time. Only **new** starts (new workflow or new employee-bound conversation
 * without a stored context) re-run binding and will fail gating when the employee is no
 * longer published.
 *
 * @see prepareEmployeeChatRuntime — chat binding (Floating AI)
 * @see use-agent-workflow — workflow binding
 */
export type AgentEmployeeExecutionContext = {
  readonly aiEmployeeId: string;
  readonly allowedToolKeys: readonly string[];
  readonly employeeRuntime: AgentRuntimeChannelBinding;
  readonly providerConnectionId: string;
  readonly executionPolicy: AgentEmployeeExecutionPolicy;
  readonly knowledgeRetrieval: AgentEmployeeKnowledgeRetrieval;
  readonly pageContext: Readonly<Record<string, unknown>>;
};

export type AgentEmployeeChannelRuntimeConfig = {
  providerConnectionId: string;
  pageContext: Record<string, unknown>;
  knowledgeRetrieval?: {
    embeddingConnectionId: string;
    vectorStoreConnectionId: string;
    collectionId: string;
    topK?: number;
    minScore?: number;
  };
  executionPolicy?: {
    streaming?: boolean;
    maxDurationMs?: number;
  };
};

function freezeKnowledgeRetrieval(
  knowledgeRetrieval: AgentRuntimeChannelBinding["knowledgeRetrieval"],
): AgentEmployeeKnowledgeRetrieval {
  if (!knowledgeRetrieval) return null;
  return Object.freeze({ ...knowledgeRetrieval });
}

function freezeEmployeeRuntime(channelRuntime: AgentRuntimeChannelBinding): AgentRuntimeChannelBinding {
  return Object.freeze({
    ...channelRuntime,
    executionPolicy: Object.freeze({ ...channelRuntime.executionPolicy }),
    pageContext: Object.freeze({ ...channelRuntime.pageContext }),
    knowledgeRetrieval: channelRuntime.knowledgeRetrieval
      ? Object.freeze({ ...channelRuntime.knowledgeRetrieval })
      : null,
  });
}

export function createAgentEmployeeExecutionContext(
  channelRuntime: AgentRuntimeChannelBinding,
  pageContext: Record<string, unknown>,
): AgentEmployeeExecutionContext {
  const allowedToolKeys = Object.freeze([...channelRuntime.pageContext.allowedToolKeys]);

  return Object.freeze({
    aiEmployeeId: channelRuntime.pageContext.aiEmployeeId,
    allowedToolKeys,
    employeeRuntime: freezeEmployeeRuntime(channelRuntime),
    providerConnectionId: channelRuntime.providerConnectionId,
    executionPolicy: Object.freeze({ ...channelRuntime.executionPolicy }),
    knowledgeRetrieval: freezeKnowledgeRetrieval(channelRuntime.knowledgeRetrieval),
    pageContext: Object.freeze({ ...pageContext }),
  });
}

export function attachAgentEmployeeExecutionContext(
  pageContext: Record<string, unknown>,
  executionContext: AgentEmployeeExecutionContext,
): Record<string, unknown> {
  return {
    ...pageContext,
    [AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY]: executionContext,
  };
}

export function readAgentEmployeeExecutionContext(
  pageContext: Record<string, unknown> | null | undefined,
): AgentEmployeeExecutionContext | null {
  const candidate = pageContext?.[AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY];
  if (!candidate || typeof candidate !== "object") return null;

  const context = candidate as Partial<AgentEmployeeExecutionContext>;
  if (typeof context.aiEmployeeId !== "string" || context.aiEmployeeId.length === 0) return null;
  if (typeof context.providerConnectionId !== "string" || context.providerConnectionId.length === 0) {
    return null;
  }
  if (!context.employeeRuntime || typeof context.employeeRuntime !== "object") return null;
  if (!context.executionPolicy || typeof context.executionPolicy !== "object") return null;
  if (!context.pageContext || typeof context.pageContext !== "object") return null;
  if (!Array.isArray(context.allowedToolKeys)) return null;

  return context as AgentEmployeeExecutionContext;
}

export function buildChannelRuntimeConfigFromExecutionContext(
  executionContext: AgentEmployeeExecutionContext,
  pageContext: Record<string, unknown>,
): AgentEmployeeChannelRuntimeConfig {
  const knowledgeRetrieval = executionContext.knowledgeRetrieval;

  return {
    providerConnectionId: executionContext.providerConnectionId,
    pageContext,
    knowledgeRetrieval:
      knowledgeRetrieval?.embeddingConnectionId &&
      knowledgeRetrieval.vectorStoreConnectionId &&
      knowledgeRetrieval.collectionId
        ? {
            embeddingConnectionId: knowledgeRetrieval.embeddingConnectionId,
            vectorStoreConnectionId: knowledgeRetrieval.vectorStoreConnectionId,
            collectionId: knowledgeRetrieval.collectionId,
            ...(knowledgeRetrieval.topK != null ? { topK: knowledgeRetrieval.topK } : {}),
            ...(knowledgeRetrieval.minScore != null ? { minScore: knowledgeRetrieval.minScore } : {}),
          }
        : undefined,
    executionPolicy: {
      streaming: executionContext.executionPolicy.streaming,
      maxDurationMs: executionContext.executionPolicy.maxDurationMs,
    },
  };
}
