import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseConversationReader } from "./ports/supabase-conversation-reader.js";
import {
  createSupabaseToolDefinitionRepository,
  createSupabaseToolExecutionRepository,
} from "./repositories/supabase-tool-repositories.js";
import { ToolExecutionService } from "./services/tool-execution-service.js";
import { ToolRegistryService } from "./services/tool-registry-service.js";
import { ToolRouterService } from "./services/tool-router-service.js";
import {
  createToolHandlerRegistryFromOptions,
  listRegisteredToolHandlerKeys,
  type CreateToolRouterServicesOptions,
} from "./tool-handler-registry.js";

export type ToolRouterServices = {
  registry: ToolRegistryService;
  executions: ToolExecutionService;
  router: ToolRouterService;
};

export { listRegisteredToolHandlerKeys, type CreateToolRouterServicesOptions };

export function createToolRouterServices(
  client: SupabaseClient,
  options?: CreateToolRouterServicesOptions,
): ToolRouterServices {
  const definitionRepository = createSupabaseToolDefinitionRepository(client);
  const executionRepository = createSupabaseToolExecutionRepository(client);
  const conversationReader = createSupabaseConversationReader(client);
  const handlers = createToolHandlerRegistryFromOptions(options);

  return {
    registry: new ToolRegistryService(definitionRepository),
    executions: new ToolExecutionService(executionRepository),
    router: new ToolRouterService(
      definitionRepository,
      executionRepository,
      conversationReader,
      handlers,
    ),
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./tools/tool-contract.js";
export * from "./tools/builtin-tools.js";
export * from "./ports/conversation-reader.js";
export * from "./ports/supabase-conversation-reader.js";
export * from "./repositories/tool-repositories.js";
export * from "./repositories/supabase-tool-repositories.js";
export * from "./services/tool-registry-service.js";
export * from "./services/tool-execution-service.js";
export * from "./services/tool-router-service.js";
export * from "./tools/create-customer-tool.js";
export * from "./tools/customer-service-port.js";
export * from "./tools/crm-agent-ports.js";
export * from "./tools/crm-agent-tools.js";
export * from "./utils/tool-logger.js";
export * from "./runtime-tool-port.js";
export * from "./llm-tool-catalog.js";
export * from "./adapters/supabase-crm-agent-tool-ports.js";
export * from "./adapters/scheduling-tool-ports.js";
export * from "./tools/scheduling-agent-ports.js";
export * from "./tools/scheduling-agent-tools.js";
export * from "./tools/ticket-agent-ports.js";
export * from "./tools/ticket-agent-tools.js";
export * from "./tools/ticket-tool-definitions.js";
export * from "./adapters/supabase-ticket-agent-tool-ports.js";
export * from "./tools/lead-agent-ports.js";
export * from "./tools/lead-agent-tools.js";
export * from "./tools/lead-tool-definitions.js";
export * from "./adapters/supabase-lead-agent-tool-ports.js";
export * from "./tools/handoff-agent-ports.js";
export * from "./tools/handoff-agent-tools.js";
export * from "./adapters/supabase-handoff-agent-tool-ports.js";
