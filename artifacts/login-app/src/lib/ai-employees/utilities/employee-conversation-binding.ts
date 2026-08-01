import type { AgentEmployeeExecutionContext } from "./agent-employee-execution-context";

const conversationExecutionContexts = new Map<string, AgentEmployeeExecutionContext>();

export function storeConversationExecutionContext(
  conversationId: string,
  executionContext: AgentEmployeeExecutionContext,
): void {
  conversationExecutionContexts.set(conversationId, executionContext);
}

export function readConversationExecutionContext(
  conversationId: string,
): AgentEmployeeExecutionContext | null {
  return conversationExecutionContexts.get(conversationId) ?? null;
}

export function clearConversationExecutionContext(conversationId: string): void {
  conversationExecutionContexts.delete(conversationId);
}

const EMPLOYEE_CONVERSATION_BINDING_PREFIX = "ai-employee-conversation-binding:";

export function employeeConversationBindingKey(companyId: string, conversationId: string): string {
  return `${EMPLOYEE_CONVERSATION_BINDING_PREFIX}${companyId}:${conversationId}`;
}

export function readStoredEmployeeConversationBinding(
  companyId: string,
  conversationId: string,
): string | null {
  try {
    const stored = sessionStorage.getItem(employeeConversationBindingKey(companyId, conversationId));
    return stored && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function storeEmployeeConversationBinding(
  companyId: string,
  conversationId: string,
  aiEmployeeId: string,
): void {
  try {
    sessionStorage.setItem(employeeConversationBindingKey(companyId, conversationId), aiEmployeeId);
  } catch {
    /* ignore storage failures */
  }
}

export function clearEmployeeConversationBinding(companyId: string, conversationId: string): void {
  try {
    sessionStorage.removeItem(employeeConversationBindingKey(companyId, conversationId));
  } catch {
    /* ignore */
  }
  clearConversationExecutionContext(conversationId);
}

export function readAiEmployeeIdFromConversationMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const aiEmployeeId = metadata?.aiEmployeeId;
  return typeof aiEmployeeId === "string" && aiEmployeeId.length > 0 ? aiEmployeeId : null;
}
