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

export type PrepareEmployeeChatRuntimeInput = {
  companyId: string;
  conversationId: string;
  basePageContext: Record<string, unknown>;
  aiEmployeeId?: string | null;
  conversationMetadata?: Record<string, unknown> | null;
  bindingResolver?: (companyId: string, aiEmployeeId: string) => Promise<AgentRuntimeChannelBinding | null>;
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

export async function prepareEmployeeChatRuntime(
  input: PrepareEmployeeChatRuntimeInput,
): Promise<PrepareEmployeeChatRuntimeResult> {
  const hydrated = hydrateEmployeeExecutionContext({
    companyId: input.companyId,
    conversationId: input.conversationId,
    basePageContext: input.basePageContext,
    conversationMetadata: input.conversationMetadata,
  });

  if (hydrated.executionContext) {
    const pageContext = attachAgentEmployeeExecutionContext(
      input.basePageContext,
      hydrated.executionContext,
    );
    return buildResult({
      pageContext,
      executionContext: hydrated.executionContext,
      metadataPatch: buildEmployeeConversationMetadataPatch(
        input.conversationMetadata ?? {},
        hydrated.executionContext,
        {
          publishedVersionId:
            typeof input.conversationMetadata?.aiEmployeeVersionId === "string"
              ? input.conversationMetadata.aiEmployeeVersionId
              : null,
          displayName:
            typeof input.conversationMetadata?.aiEmployeeDisplayName === "string"
              ? input.conversationMetadata.aiEmployeeDisplayName
              : hydrated.executionContext.employeeRuntime.pageContext.aiEmployeeName,
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
  const executionContext = createAgentEmployeeExecutionContext(channelRuntime, mergedPageContext);
  const pageContext = attachAgentEmployeeExecutionContext(mergedPageContext, executionContext);

  registerConversationToolScope(input.conversationId, {
    allowedToolKeys: executionContext.allowedToolKeys,
    employeeId: executionContext.aiEmployeeId,
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
