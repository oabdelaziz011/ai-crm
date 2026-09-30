import type {
  RuntimeToolPort,
  RuntimeToolRouteInput,
  RuntimeToolRouteResult,
  ServiceContext,
} from "@workspace/ai-execution-engine";
import type { ChannelEmployeeRuntimePort } from "@workspace/channel-platform";
import {
  AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY,
  readAgentEmployeeExecutionContext,
  registerConversationToolScope,
} from "../../platform/employee-runtime-bridge.js";

/**
 * Deny-by-default allowlist for anonymous public Web Chat visitors.
 * Everything else (customer/lead/ticket/invoice/booking record access, CRM search,
 * update/merge/import, create_customer/create_lead, workflow transfer) is blocked.
 */
export const PUBLIC_WEB_CHAT_ALLOWED_TOOL_KEYS = Object.freeze([
  "knowledge_search",
  "search_availability",
  "find_next_available",
  "recommend_appointment",
  "escalate_to_human",
  "queue_handoff",
] as const);

const ALLOWED = new Set<string>(PUBLIC_WEB_CHAT_ALLOWED_TOOL_KEYS);

export const PUBLIC_WEB_CHAT_TOOL_DENIED_CODE = "PUBLIC_WEB_CHAT_TOOL_BLOCKED";

export type PublicWebChatChannelResolver = {
  isPublicWebChatChannel(companyChannelId: string): Promise<boolean>;
  isPublicWebChatConversation(conversationId: string): Promise<boolean>;
};

export function isPublicWebChatToolAllowed(toolKey: string): boolean {
  return ALLOWED.has(toolKey);
}

export function filterPublicWebChatToolKeys(toolKeys: readonly string[]): string[] {
  return toolKeys.filter((toolKey) => ALLOWED.has(toolKey));
}

/** Narrows the frozen AI Employee execution context + page context to the public allowlist. */
export function restrictPageContextToPublicWebChat(
  pageContext: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...pageContext, publicWebChat: true };
  if (Array.isArray(pageContext.allowedToolKeys)) {
    next.allowedToolKeys = filterPublicWebChatToolKeys(pageContext.allowedToolKeys as string[]);
  }
  const executionContext = readAgentEmployeeExecutionContext(pageContext);
  if (executionContext) {
    next[AGENT_EMPLOYEE_EXECUTION_CONTEXT_KEY] = Object.freeze({
      ...executionContext,
      allowedToolKeys: Object.freeze(filterPublicWebChatToolKeys(executionContext.allowedToolKeys)),
    });
  }
  return next;
}

function deniedResult(toolKey: string): RuntimeToolRouteResult {
  return {
    executionId: `public-web-chat-denied-${Date.now()}`,
    toolKey,
    status: "failed",
    output: {
      denied: true,
      errorCode: PUBLIC_WEB_CHAT_TOOL_DENIED_CODE,
      reason: "This action is not available in public website chat.",
    },
    durationMs: 0,
    errorCode: PUBLIC_WEB_CHAT_TOOL_DENIED_CODE,
    errorMessage: "Tool is not available in public website chat.",
  };
}

/**
 * Route-time enforcement for public Web Chat conversations (authoritative).
 * Other channels pass through unchanged. Lookup failure fails closed.
 */
export function createPublicWebChatToolGuard(
  base: RuntimeToolPort,
  resolver: Pick<PublicWebChatChannelResolver, "isPublicWebChatConversation">,
): RuntimeToolPort {
  return {
    allowedToolKeys: () => base.allowedToolKeys(),
    listLlmTools: () => base.listLlmTools(),
    async route(ctx: ServiceContext, input: RuntimeToolRouteInput): Promise<RuntimeToolRouteResult> {
      if (!input.conversationId) return base.route(ctx, input);
      let isPublic: boolean;
      try {
        isPublic = await resolver.isPublicWebChatConversation(input.conversationId);
      } catch {
        return deniedResult(input.toolKey);
      }
      if (isPublic && !isPublicWebChatToolAllowed(input.toolKey)) {
        return deniedResult(input.toolKey);
      }
      return base.route(ctx, input);
    },
  };
}

/** Prepare-time narrowing so the LLM is only offered public-safe tools. */
export function withPublicWebChatEmployeeToolPolicy(
  base: ChannelEmployeeRuntimePort,
  resolver: Pick<PublicWebChatChannelResolver, "isPublicWebChatChannel">,
): ChannelEmployeeRuntimePort {
  return {
    ...base,
    async prepareForConversation(input) {
      const prepared = await base.prepareForConversation(input);
      const companyChannelId =
        typeof input.basePageContext?.companyChannelId === "string"
          ? input.basePageContext.companyChannelId
          : null;
      if (!prepared || !companyChannelId) return prepared;
      if (!(await resolver.isPublicWebChatChannel(companyChannelId))) return prepared;

      const pageContext = restrictPageContextToPublicWebChat(prepared.runtimeConfig.pageContext ?? {});
      const executionContext = readAgentEmployeeExecutionContext(pageContext);
      if (executionContext) {
        registerConversationToolScope(input.conversationId, {
          allowedToolKeys: executionContext.allowedToolKeys,
          employeeId: executionContext.aiEmployeeId,
        });
      }
      return {
        ...prepared,
        runtimeConfig: { ...prepared.runtimeConfig, pageContext },
      };
    },
  };
}
