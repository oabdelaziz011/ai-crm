import type { AgentRuntimeChannelBinding } from "@/lib/ai-employees/adapters/ai-employee-runtime-types";
import {
  attachAgentEmployeeExecutionContext,
  buildChannelRuntimeConfigFromExecutionContext,
  createAgentEmployeeExecutionContext,
  readAgentEmployeeExecutionContext,
  type AgentEmployeeChannelRuntimeConfig,
  type AgentEmployeeExecutionContext,
} from "@/lib/ai-employees/utilities/agent-employee-execution-context";
import {
  buildEmployeeConversationMetadataPatch,
  hydrateEmployeeExecutionContext,
} from "@/lib/ai-employees/utilities/conversation-employee-context-hydrator";
import {
  storeConversationExecutionContext,
  storeEmployeeConversationBinding,
} from "@/lib/ai-employees/utilities/employee-conversation-binding";
import { mergeEmployeePageContext } from "@/lib/ai-employees/utilities/merge-employee-page-context";
import { registerConversationToolScope } from "@/lib/ai-employees/utilities/tool-scope-context";
import { resolveEntitledAssignedToolKeys } from "@/lib/ai-employees/utilities/ai-employee-capability-catalog";
import type { AiEmployeeCommercialEntitlementPort } from "@/lib/ai-employees/utilities/ai-employee-commercial-runtime-gate";

export type PrepareEmployeeChatRuntimeInput = {
  companyId: string;
  conversationId: string;
  basePageContext: Record<string, unknown>;
  aiEmployeeId?: string | null;
  conversationMetadata?: Record<string, unknown> | null;
  bindingResolver?: (companyId: string, aiEmployeeId: string) => Promise<AgentRuntimeChannelBinding | null>;
  /**
   * When true (WhatsApp webhook), always re-resolve the live employee binding.
   * Stale conversation snapshots can omit tools that were enabled later (e.g. search_ticket).
   */
  preferFreshBinding?: boolean;
  /**
   * Live commercial entitlement SoT. When provided, offer/scope intersects
   * assigned tools with {@link resolveEntitledAssignedToolKeys} so handoff tools
   * are never offered without Omnichannel.
   */
  commercialEntitlement?: AiEmployeeCommercialEntitlementPort;
};

export type PrepareEmployeeChatRuntimeResult = {
  pageContext: Record<string, unknown>;
  executionContext: AgentEmployeeExecutionContext | null;
  runtimeConfigOverrides: Partial<AgentEmployeeChannelRuntimeConfig> | null;
  metadataPatch: Record<string, unknown> | null;
  resolveCount: number;
  reusedExistingContext: boolean;
  hydrationSource: ReturnType<typeof hydrateEmployeeExecutionContext>["source"];
};

function buildResult(input: {
  pageContext: Record<string, unknown>;
  executionContext: AgentEmployeeExecutionContext | null;
  metadataPatch: Record<string, unknown> | null;
  resolveCount: number;
  reusedExistingContext: boolean;
  hydrationSource: PrepareEmployeeChatRuntimeResult["hydrationSource"];
}): PrepareEmployeeChatRuntimeResult {
  return {
    pageContext: input.pageContext,
    executionContext: input.executionContext,
    runtimeConfigOverrides: input.executionContext
      ? buildChannelRuntimeConfigFromExecutionContext(input.executionContext, input.pageContext)
      : null,
    metadataPatch: input.metadataPatch,
    resolveCount: input.resolveCount,
    reusedExistingContext: input.reusedExistingContext,
    hydrationSource: input.hydrationSource,
  };
}

async function applyCommercialOfferScope(
  companyId: string,
  executionContext: AgentEmployeeExecutionContext,
  commercialEntitlement?: AiEmployeeCommercialEntitlementPort,
): Promise<AgentEmployeeExecutionContext> {
  if (!commercialEntitlement) return executionContext;

  const filteredKeys = await resolveEntitledAssignedToolKeys({
    companyId,
    assignedToolKeys: executionContext.allowedToolKeys,
    isFeatureEnabled: commercialEntitlement.isFeatureEnabled,
  });

  if (
    filteredKeys.length === executionContext.allowedToolKeys.length &&
    filteredKeys.every((key, index) => key === executionContext.allowedToolKeys[index])
  ) {
    return executionContext;
  }

  const pageContext = Object.freeze({
    ...executionContext.pageContext,
    allowedToolKeys: filteredKeys,
  });
  const employeeRuntimePage = Object.freeze({
    ...executionContext.employeeRuntime.pageContext,
    allowedToolKeys: filteredKeys,
  });

  return Object.freeze({
    ...executionContext,
    allowedToolKeys: Object.freeze([...filteredKeys]),
    pageContext,
    employeeRuntime: Object.freeze({
      ...executionContext.employeeRuntime,
      pageContext: employeeRuntimePage,
    }),
  });
}

function isReusableChannelBinding(
  executionContext: AgentEmployeeExecutionContext,
  aiEmployeeId?: string | null,
): boolean {
  if (aiEmployeeId && executionContext.aiEmployeeId !== aiEmployeeId) return false;
  if (!executionContext.providerConnectionId) return false;
  const page = executionContext.pageContext ?? {};
  const runtimePage = executionContext.employeeRuntime.pageContext ?? {};
  const systemPrompt =
    (typeof page.systemPrompt === "string" && page.systemPrompt) ||
    (typeof runtimePage.systemPrompt === "string" && runtimePage.systemPrompt) ||
    "";
  const transferableFlowId =
    (typeof page.transferableFlowId === "string" && page.transferableFlowId) ||
    (typeof runtimePage.transferableFlowId === "string" && runtimePage.transferableFlowId) ||
    "";
  // Stale conversation snapshots historically omitted prompts — only reuse complete bindings.
  return (
    systemPrompt.trim().length > 0 ||
    executionContext.allowedToolKeys.length > 0 ||
    transferableFlowId.trim().length > 0
  );
}

export async function prepareEmployeeChatRuntime(
  input: PrepareEmployeeChatRuntimeInput,
): Promise<PrepareEmployeeChatRuntimeResult> {
  const hydrated = hydrateEmployeeExecutionContext({
    companyId: input.companyId,
    conversationId: input.conversationId,
    basePageContext: input.basePageContext,
    conversationMetadata: input.conversationMetadata,
  });

  const canReuse =
    !input.preferFreshBinding &&
    hydrated.executionContext != null &&
    isReusableChannelBinding(hydrated.executionContext, input.aiEmployeeId);

  if (canReuse && hydrated.executionContext) {
    // Preserve systemPrompt / allowedToolKeys / transferableFlowId from the frozen
    // employee pageContext. basePageContext alone is channel routing metadata only.
    // Re-apply commercial offer intersect so Omnichannel loss drops handoff tools.
    const executionContext = await applyCommercialOfferScope(
      input.companyId,
      hydrated.executionContext,
      input.commercialEntitlement,
    );
    const pageContext = attachAgentEmployeeExecutionContext(
      {
        ...executionContext.pageContext,
        ...input.basePageContext,
      },
      executionContext,
    );
    registerConversationToolScope(input.conversationId, {
      allowedToolKeys: executionContext.allowedToolKeys,
      employeeId: executionContext.aiEmployeeId,
      showProductPrices: executionContext.employeeRuntime.pageContext?.showProductPrices === true,
    });
    return buildResult({
      pageContext,
      executionContext,
      metadataPatch: buildEmployeeConversationMetadataPatch(
        input.conversationMetadata ?? {},
        executionContext,
        {
          publishedVersionId:
            typeof input.conversationMetadata?.aiEmployeeVersionId === "string"
              ? input.conversationMetadata.aiEmployeeVersionId
              : null,
          displayName:
            typeof input.conversationMetadata?.aiEmployeeDisplayName === "string"
              ? input.conversationMetadata.aiEmployeeDisplayName
              : executionContext.employeeRuntime.pageContext.aiEmployeeName,
        },
      ),
      resolveCount: 0,
      reusedExistingContext: true,
      hydrationSource: hydrated.source,
    });
  }

  const aiEmployeeId = input.aiEmployeeId ?? hydrated.aiEmployeeId;
  if (!aiEmployeeId) {
    return buildResult({
      pageContext: input.basePageContext,
      executionContext: null,
      metadataPatch: null,
      resolveCount: 0,
      reusedExistingContext: false,
      hydrationSource: "none",
    });
  }

  const channelRuntime = input.bindingResolver
    ? await input.bindingResolver(input.companyId, aiEmployeeId)
    : await (
        await import("@/lib/ai-employees/services/resolve-employee-channel-runtime")
      ).resolveEmployeeChannelRuntime(input.companyId, aiEmployeeId);

  if (!channelRuntime) {
    return buildResult({
      pageContext: input.basePageContext,
      executionContext: null,
      metadataPatch: null,
      resolveCount: 1,
      reusedExistingContext: false,
      hydrationSource: "none",
    });
  }

  const mergedPageContext = mergeEmployeePageContext(input.basePageContext, channelRuntime);
  const rawExecutionContext = createAgentEmployeeExecutionContext(channelRuntime, mergedPageContext);
  const executionContext = await applyCommercialOfferScope(
    input.companyId,
    rawExecutionContext,
    input.commercialEntitlement,
  );
  const pageContext = attachAgentEmployeeExecutionContext(
    {
      ...mergedPageContext,
      ...executionContext.pageContext,
      allowedToolKeys: [...executionContext.allowedToolKeys],
    },
    executionContext,
  );

  registerConversationToolScope(input.conversationId, {
    allowedToolKeys: executionContext.allowedToolKeys,
    employeeId: executionContext.aiEmployeeId,
    showProductPrices: executionContext.employeeRuntime.pageContext?.showProductPrices === true,
  });
  storeConversationExecutionContext(input.conversationId, executionContext);
  storeEmployeeConversationBinding(input.companyId, input.conversationId, executionContext.aiEmployeeId);

  return buildResult({
    pageContext,
    executionContext,
    metadataPatch: buildEmployeeConversationMetadataPatch(
      input.conversationMetadata ?? {},
      executionContext,
      {
        publishedVersionId:
          typeof input.conversationMetadata?.aiEmployeeVersionId === "string"
            ? input.conversationMetadata.aiEmployeeVersionId
            : null,
        displayName:
          typeof input.conversationMetadata?.aiEmployeeDisplayName === "string"
            ? input.conversationMetadata.aiEmployeeDisplayName
            : executionContext.employeeRuntime.pageContext.aiEmployeeName,
      },
    ),
    resolveCount: 1,
    reusedExistingContext: false,
    hydrationSource: "none",
  });
}

export { readAgentEmployeeExecutionContext };
