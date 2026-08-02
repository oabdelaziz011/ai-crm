import {
  AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY,
  readAgentEmployeeExecutionContext,
  type AgentEmployeeExecutionContext,
} from "./agent-employee-execution-context";
import {
  readAiEmployeeIdFromConversationMetadata,
  readConversationExecutionContext,
  readStoredEmployeeConversationBinding,
  storeConversationExecutionContext,
  storeEmployeeConversationBinding,
} from "./employee-conversation-binding";
import { readAiEmployeeIdFromPageContext } from "./merge-employee-page-context";
import { registerConversationToolScope } from "./tool-scope-context";

export type EmployeeExecutionContextHydrationSource =
  | "page_context"
  | "memory_store"
  | "conversation_metadata"
  | "none";

export type HydratedEmployeeExecutionContext = {
  executionContext: AgentEmployeeExecutionContext | null;
  aiEmployeeId: string | null;
  source: EmployeeExecutionContextHydrationSource;
};

function registerHydratedExecutionContext(
  conversationId: string,
  companyId: string,
  executionContext: AgentEmployeeExecutionContext,
): void {
  storeConversationExecutionContext(conversationId, executionContext);
  storeEmployeeConversationBinding(companyId, conversationId, executionContext.aiEmployeeId);
  registerConversationToolScope(conversationId, {
    allowedToolKeys: executionContext.allowedToolKeys,
    employeeId: executionContext.aiEmployeeId,
  });
}

export function serializeExecutionContextForConversationMetadata(
  executionContext: AgentEmployeeExecutionContext,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(executionContext)) as Record<string, unknown>;
}

export function hydrateExecutionContextFromConversationMetadata(
  metadata: Record<string, unknown> | null | undefined,
): AgentEmployeeExecutionContext | null {
  const snapshot = metadata?.[AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY];
  if (!snapshot || typeof snapshot !== "object") return null;

  return readAgentEmployeeExecutionContext({
    [AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY]: snapshot,
  });
}

export function buildEmployeeConversationMetadataPatch(
  existingMetadata: Record<string, unknown>,
  executionContext: AgentEmployeeExecutionContext,
  employee?: {
    publishedVersionId?: string | null;
    displayName?: string | null;
  },
): Record<string, unknown> {
  const displayName =
    employee?.displayName?.trim() ||
    executionContext.employeeRuntime.pageContext.aiEmployeeName ||
    null;

  return {
    ...existingMetadata,
    aiEmployeeId: executionContext.aiEmployeeId,
    aiEmployeeVersionId:
      employee?.publishedVersionId ??
      (typeof existingMetadata.aiEmployeeVersionId === "string"
        ? existingMetadata.aiEmployeeVersionId
        : null),
    aiEmployeeDisplayName: displayName,
    [AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY]:
      serializeExecutionContextForConversationMetadata(executionContext),
  };
}

export function hydrateEmployeeExecutionContext(input: {
  companyId: string;
  conversationId: string;
  basePageContext: Record<string, unknown>;
  conversationMetadata?: Record<string, unknown> | null;
}): HydratedEmployeeExecutionContext {
  const fromPageContext = readAgentEmployeeExecutionContext(input.basePageContext);
  if (fromPageContext) {
    registerHydratedExecutionContext(input.conversationId, input.companyId, fromPageContext);
    return {
      executionContext: fromPageContext,
      aiEmployeeId: fromPageContext.aiEmployeeId,
      source: "page_context",
    };
  }

  const fromMemoryStore = readConversationExecutionContext(input.conversationId);
  if (fromMemoryStore) {
    registerHydratedExecutionContext(input.conversationId, input.companyId, fromMemoryStore);
    return {
      executionContext: fromMemoryStore,
      aiEmployeeId: fromMemoryStore.aiEmployeeId,
      source: "memory_store",
    };
  }

  const fromMetadata = hydrateExecutionContextFromConversationMetadata(input.conversationMetadata);
  if (fromMetadata) {
    registerHydratedExecutionContext(input.conversationId, input.companyId, fromMetadata);
    return {
      executionContext: fromMetadata,
      aiEmployeeId: fromMetadata.aiEmployeeId,
      source: "conversation_metadata",
    };
  }

  const aiEmployeeId =
    readAiEmployeeIdFromPageContext(input.basePageContext) ??
    readAiEmployeeIdFromConversationMetadata(input.conversationMetadata) ??
    readStoredEmployeeConversationBinding(input.companyId, input.conversationId);

  return {
    executionContext: null,
    aiEmployeeId,
    source: "none",
  };
}

export function rehydrateConversationExecutionContextFromMetadata(input: {
  companyId: string;
  conversationId: string;
  metadata: Record<string, unknown> | null | undefined;
}): AgentEmployeeExecutionContext | null {
  const hydrated = hydrateEmployeeExecutionContext({
    companyId: input.companyId,
    conversationId: input.conversationId,
    basePageContext: {},
    conversationMetadata: input.metadata,
  });

  return hydrated.executionContext;
}
