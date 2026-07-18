import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseConversationReader } from "./ports/supabase-conversation-reader.js";
import {
  createSupabaseToolDefinitionRepository,
  createSupabaseToolExecutionRepository,
} from "./repositories/supabase-tool-repositories.js";
import { ToolExecutionService } from "./services/tool-execution-service.js";
import { ToolRegistryService } from "./services/tool-registry-service.js";
import { ToolRouterService } from "./services/tool-router-service.js";
import { createBuiltinTools } from "./tools/builtin-tools.js";
import { createToolHandlerRegistry } from "./tools/tool-contract.js";

export type ToolRouterServices = {
  registry: ToolRegistryService;
  executions: ToolExecutionService;
  router: ToolRouterService;
};

export function createToolRouterServices(client: SupabaseClient): ToolRouterServices {
  const definitionRepository = createSupabaseToolDefinitionRepository(client);
  const executionRepository = createSupabaseToolExecutionRepository(client);
  const conversationReader = createSupabaseConversationReader(client);
  const handlers = createToolHandlerRegistry(createBuiltinTools());

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
export * from "./utils/tool-utils.js";
