import type { AgentRuntimeChannelBinding } from "@/lib/ai-employees/adapters/ai-employee-runtime-types";

export function mergeEmployeePageContext(
  basePageContext: Record<string, unknown>,
  channelRuntime: AgentRuntimeChannelBinding | null | undefined,
): Record<string, unknown>  {
  if (!channelRuntime) return basePageContext;
  const merged: Record<string, unknown> = {
    ...basePageContext,
    ...channelRuntime.pageContext,
  };
  // Preserve Phase 2 trusted channel identity from inbound base context.
  if (typeof basePageContext.trustedCustomerId === "string" && basePageContext.trustedCustomerId.trim()) {
    merged.trustedCustomerId = basePageContext.trustedCustomerId.trim();
  }
  if (
    typeof basePageContext.trustedCustomerName === "string" &&
    basePageContext.trustedCustomerName.trim()
  ) {
    merged.trustedCustomerName = basePageContext.trustedCustomerName.trim();
  }
  return merged;
}

export function readAiEmployeeIdFromPageContext(
  pageContext: Record<string, unknown> | null | undefined,
): string | null {
  const aiEmployeeId = pageContext?.aiEmployeeId;
  return typeof aiEmployeeId === "string" && aiEmployeeId.length > 0 ? aiEmployeeId : null;
}
