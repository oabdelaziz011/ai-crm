import type { AgentRuntimeChannelBinding } from "@/lib/ai-employees/adapters/ai-employee-runtime-types";

export function mergeEmployeePageContext(
  basePageContext: Record<string, unknown>,
  channelRuntime: AgentRuntimeChannelBinding | null | undefined,
): Record<string, unknown> {
  if (!channelRuntime) return basePageContext;
  return {
    ...basePageContext,
    ...channelRuntime.pageContext,
  };
}

export function readAiEmployeeIdFromPageContext(
  pageContext: Record<string, unknown> | null | undefined,
): string | null {
  const aiEmployeeId = pageContext?.aiEmployeeId;
  return typeof aiEmployeeId === "string" && aiEmployeeId.length > 0 ? aiEmployeeId : null;
}
