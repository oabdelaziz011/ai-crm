export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./task-graph/task-graph.js";
export * from "./planner/agent-planner.js";
export * from "./planner/crm-agent-planner.js";
export * from "./planner/crm-report-builder.js";
export * from "./verification/verification-service.js";
export * from "./memory/agent-memory.js";
export * from "./events/agent-event-publisher.js";
export * from "./checkpoint/checkpoint-service.js";
export * from "./executor/agent-execution-engine.js";
export * from "./utils/crm-tool-permissions.js";
export { createSupabaseAgentWorkflowRepository } from "./checkpoint/checkpoint-service.js";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAgentWorkflowRepository } from "./checkpoint/checkpoint-service.js";
import { AgentExecutionEngine, AgentRuntimeService } from "./executor/agent-execution-engine.js";
import type { AgentRuntimePorts } from "./types.js";

export function createAgentRuntimeServices(client: SupabaseClient, ports: AgentRuntimePorts) {
  const repo = createSupabaseAgentWorkflowRepository(client);
  const engine = new AgentExecutionEngine(repo, ports);
  return {
    runtime: new AgentRuntimeService(engine),
    repository: repo,
  };
}

export type AgentRuntimeServices = ReturnType<typeof createAgentRuntimeServices>;
