import type {
  EnterpriseRuntimeCoordinatorPort,
  EnterpriseRuntimeInternalPort,
  UnifiedRuntimeExecuteRequest,
  UnifiedRuntimeExecuteResponse,
  UnifiedRuntimeServiceContext,
} from "@workspace/application-layer";
import type { RuntimeIntegrationServices } from "@workspace/runtime-integration";
import type { AIExecutionServices } from "@workspace/ai-execution-engine";
import type { ServiceContext } from "@workspace/runtime-integration";

/** Adapts EnterpriseRuntimeCoordinator to Application Layer unified runtime port. */
export function createRuntimeCoordinatorPort(
  services: RuntimeIntegrationServices,
): EnterpriseRuntimeCoordinatorPort {
  return Object.freeze({
    async execute(ctx: UnifiedRuntimeServiceContext, input: UnifiedRuntimeExecuteRequest) {
      const runtimeCtx: ServiceContext = {
        userId: ctx.userId,
        companyId: ctx.companyId,
        isSuperAdmin: ctx.isSuperAdmin,
        hasPermission: ctx.hasPermission,
      };
      const response = await services.coordinator.execute(runtimeCtx, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        messageText: input.messageText,
        pageContext: input.pageContext,
        correlationId: input.correlationId,
        policyId: input.policyId,
        providerConnectionId: input.providerConnectionId,
        knowledgeRetrieval: input.knowledgeRetrieval,
        executionPolicy: input.executionPolicy,
        onStreamChunk: input.onStreamChunk,
        abortSignal: input.abortSignal,
      });
      return {
        runtimeId: response.runtimeId,
        executionId: response.executionId,
        correlationId: response.correlationId,
        executionTimeMs: response.executionTimeMs,
        intentKey: response.intentKey,
        providerKey: response.providerKey,
        responseContent: response.responseContent,
        tokenUsage: {
          promptTokens: response.tokenUsage.promptTokens,
          completionTokens: response.tokenUsage.completionTokens,
          totalTokens: response.tokenUsage.totalTokens,
        },
        steps: response.steps,
      };
    },
  });
}

export function createInternalEnterpriseRuntimePort(
  executionServices: AIExecutionServices,
): EnterpriseRuntimeInternalPort {
  const runtime = executionServices.enterpriseRuntime;
  if (!runtime) {
    throw new Error("Enterprise AI Runtime is not configured.");
  }
  return Object.freeze({
    buildPrompt: (ctx, input) => runtime.buildPrompt(ctx as never, input as never),
    execute: (ctx, input) => runtime.execute(ctx as never, input as never),
  });
}
