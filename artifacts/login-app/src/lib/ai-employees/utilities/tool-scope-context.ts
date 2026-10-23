export type EmployeeToolScope = {
  readonly allowedToolKeys: readonly string[];
  readonly employeeId: string;
  /** Owner setting copied from the employee runtime. Absent means prices stay hidden. */
  readonly showProductPrices?: boolean;
};

const activeToolScopeStack: EmployeeToolScope[] = [];
const conversationToolScopes = new Map<string, EmployeeToolScope>();

export function runWithEmployeeToolScope<T>(
  scope: EmployeeToolScope,
  operation: () => T | Promise<T>,
): T | Promise<T> {
  activeToolScopeStack.push(scope);

  try {
    const result = operation();
    if (result instanceof Promise) {
      return result.finally(() => {
        activeToolScopeStack.pop();
      });
    }

    activeToolScopeStack.pop();
    return result;
  } catch (error) {
    activeToolScopeStack.pop();
    throw error;
  }
}

export function readActiveEmployeeToolScope(): EmployeeToolScope | null {
  return activeToolScopeStack.at(-1) ?? null;
}

export function registerConversationToolScope(
  conversationId: string,
  scope: EmployeeToolScope,
): void {
  conversationToolScopes.set(conversationId, scope);
}

export function clearConversationToolScope(conversationId: string): void {
  conversationToolScopes.delete(conversationId);
}

export function readConversationToolScope(conversationId: string): EmployeeToolScope | null {
  return conversationToolScopes.get(conversationId) ?? null;
}

export function resolveActiveToolScope(conversationId?: string | null): EmployeeToolScope | null {
  const activeScope = readActiveEmployeeToolScope();
  if (activeScope) return activeScope;
  if (conversationId) return readConversationToolScope(conversationId);
  return null;
}

export function readEmployeeShowProductPrices(execution: {
  readonly employeeRuntime?: { readonly pageContext?: { readonly showProductPrices?: unknown } };
} | null | undefined): boolean {
  return execution?.employeeRuntime?.pageContext?.showProductPrices === true;
}
