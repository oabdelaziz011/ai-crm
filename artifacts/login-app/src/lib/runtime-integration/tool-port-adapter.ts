import {
  CREATE_CUSTOMER_LLM_TOOL_DEFINITION,
  CREATE_CUSTOMER_TOOL_KEY,
  type ToolRouterServices,
} from "@workspace/ai-tool-router";
import type { RuntimeToolPort } from "@workspace/ai-execution-engine";
import type { ServiceContext as ToolServiceContext } from "@workspace/ai-tool-router";
import type { ServiceContext as RuntimeServiceContext } from "@workspace/runtime-integration";

export function createRuntimeToolPort(
  toolServices: ToolRouterServices,
): RuntimeToolPort {
  return {
    async route(ctx: RuntimeServiceContext, input) {
      const result = await toolServices.router.route(ctx as ToolServiceContext, {
        conversationId: input.conversationId,
        toolKey: input.toolKey,
        input: input.input,
        triggeredBy: input.triggeredBy,
      });
      return result;
    },
    listLlmTools() {
      return [CREATE_CUSTOMER_LLM_TOOL_DEFINITION];
    },
    allowedToolKeys() {
      return [CREATE_CUSTOMER_TOOL_KEY];
    },
  };
}

export type { ToolServiceContext };
