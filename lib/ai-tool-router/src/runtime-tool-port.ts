import type { RuntimeToolPort } from "@workspace/ai-execution-engine";
import type { ServiceContext as RuntimeServiceContext } from "@workspace/runtime-integration";
import type { ServiceContext as ToolServiceContext } from "./types.js";
import type { CreateToolRouterServicesOptions } from "./tool-handler-registry.js";
import { listRegisteredToolHandlerKeys } from "./tool-handler-registry.js";
import { resolveLlmToolExposure } from "./llm-tool-catalog.js";
import type { ToolRouterService } from "./services/tool-router-service.js";
import { AiGuideToolBlockedError, AI_GUIDE_TOOL_BLOCKED_CODE } from "./errors.js";

export type RuntimeToolPortServices = {
  router: ToolRouterService;
};

export function createRuntimeToolPort(
  toolServices: RuntimeToolPortServices,
  createOptions?: CreateToolRouterServicesOptions,
): RuntimeToolPort {
  const registeredKeys = listRegisteredToolHandlerKeys(createOptions);
  const exposure = resolveLlmToolExposure(registeredKeys);

  return {
    async route(ctx: RuntimeServiceContext, input) {
      try {
        return await toolServices.router.route(ctx as ToolServiceContext, {
          conversationId: input.conversationId,
          toolKey: input.toolKey,
          input: input.input,
          triggeredBy: input.triggeredBy,
          conversationTexts: input.conversationTexts,
        });
      } catch (error) {
        if (error instanceof AiGuideToolBlockedError) {
          return {
            executionId: `ai-guide-denied-${Date.now()}`,
            toolKey: input.toolKey,
            status: "failed",
            output: {
              denied: true,
              errorCode: AI_GUIDE_TOOL_BLOCKED_CODE,
              reason: error.message,
            },
            durationMs: 0,
            errorCode: AI_GUIDE_TOOL_BLOCKED_CODE,
            errorMessage: error.message,
          };
        }
        throw error;
      }
    },
    listLlmTools() {
      return exposure.llmTools;
    },
    allowedToolKeys() {
      return exposure.allowedToolKeys;
    },
  };
}
