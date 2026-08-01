import type { AgentRuntimeChannelBinding } from "../adapters/ai-employee-runtime-types";
import type { AgentRuntimeConfiguration } from "../adapters";
import type { AiEmployeeRecord } from "../types";

export function evaluateEmployeeChannelRuntimeBinding(
  employee: AiEmployeeRecord | null | undefined,
  preview: AgentRuntimeConfiguration | null | undefined,
): AgentRuntimeChannelBinding | null {
  if (!employee) return null;
  if (employee.status !== "published") return null;
  if (!preview?.ready) return null;
  if (!preview.channelRuntime) return null;
  return preview.channelRuntime;
}
