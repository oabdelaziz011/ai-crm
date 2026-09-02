/**
 * Pure helpers for customer-scoped automation Activity.
 * Customer linkage is UUID-only via jsonb context paths — never phone/email/last-9.
 */

export const AUTOMATION_CUSTOMER_CONTEXT_PATHS = [
  "customerId",
  "customer_id",
  "params.customerId",
  "params.customer_id",
] as const;

/**
 * PostgREST `.or()` filter for deterministic customer UUID linkage inside context jsonb.
 * Always combine with `.eq("company_id", companyId)` at the call site.
 */
export function buildAutomationCustomerOrFilter(customerId: string): string {
  const id = customerId.trim();
  if (!id) {
    throw new Error("customerId is required for automation Activity scoping");
  }
  // UUIDs are safe unquoted PostgREST filter values (no commas/parens).
  return [
    `context->>customerId.eq.${id}`,
    `context->>customer_id.eq.${id}`,
    `context->params->>customerId.eq.${id}`,
    `context->params->>customer_id.eq.${id}`,
  ].join(",");
}

function readPath(context: Record<string, unknown>, path: string): string | null {
  if (path === "customerId" || path === "customer_id") {
    const value = context[path];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  if (path.startsWith("params.")) {
    const params = context.params;
    if (!params || typeof params !== "object" || Array.isArray(params)) return null;
    const key = path.slice("params.".length);
    const value = (params as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  return null;
}

/** Deterministic ownership check after a server-side OR filter (defense in depth). */
export function automationContextBelongsToCustomer(
  context: unknown,
  customerId: string,
): boolean {
  const id = customerId.trim();
  if (!id || !context || typeof context !== "object" || Array.isArray(context)) {
    return false;
  }
  const record = context as Record<string, unknown>;
  for (const path of AUTOMATION_CUSTOMER_CONTEXT_PATHS) {
    if (readPath(record, path) === id) return true;
  }
  return false;
}
