import { readRuntimeEnvFlag } from "@workspace/platform-crypto/runtime-env-unified";

export function isMasterWorkflowTraceEnabled(): boolean {
  return readRuntimeEnvFlag("AUTOMATION_WORKFLOW_TRACE_DEBUG");
}

export function isIfNodeTraceEnabled(): boolean {
  return isMasterWorkflowTraceEnabled() || readRuntimeEnvFlag("AUTOMATION_IF_TRACE_DEBUG");
}

export function isListNodeLifecycleDebugEnabled(): boolean {
  return isMasterWorkflowTraceEnabled() || readRuntimeEnvFlag("AUTOMATION_LIST_NODE_DEBUG");
}

export function isInboundRoutingTraceEnabled(): boolean {
  return isMasterWorkflowTraceEnabled() || readRuntimeEnvFlag("AUTOMATION_INBOUND_ROUTING_DEBUG");
}

export function isWorkflowExecutionTraceEnabled(): boolean {
  return isMasterWorkflowTraceEnabled() || readRuntimeEnvFlag("AUTOMATION_WORKFLOW_EXECUTION_DEBUG");
}
