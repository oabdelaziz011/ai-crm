/**
 * Phase 0B — AI Guide security helpers + defense-in-depth tool guard.
 * Authoritative denial for authenticated Floating AI tools lives in
 * @workspace/ai-tool-router ToolRouterService (conversations.ai_guide_locked).
 * This module must never treat client pageContext / mutable metadata as sole authority.
 */
import type {
  RuntimeToolPort,
  RuntimeToolRouteInput,
  RuntimeToolRouteResult,
  ServiceContext,
} from "@workspace/ai-execution-engine";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_GUIDE_TOOL_BLOCKED_CODE } from "@workspace/ai-tool-router";
import {
  resolveActiveToolScope,
  registerConversationToolScope,
} from "@/lib/ai-employees/utilities/tool-scope-context";

/** Persisted on conversation.metadata.source at create — mirrored into ai_guide_locked by DB trigger. */
export const GUIDE_CONVERSATION_SOURCE = "floating_ai_guide" as const;
export const ASSIST_FLOATING_CONVERSATION_SOURCE = "floating_ai_assistant" as const;

export const ASSIST_CONVERSATION_STORAGE_PREFIX = "vault-ai-chat-conversation";
export const GUIDE_CONVERSATION_STORAGE_PREFIX = "vault-ai-chat-conversation-guide";

export const GUIDE_RUNTIME_SCOPE_EMPLOYEE_ID = "__ai_guide__";

export const AI_GUIDE_TOOL_DENIED_CODE = AI_GUIDE_TOOL_BLOCKED_CODE;

export const GUIDE_ALLOWED_TOOL_KEYS: readonly string[] = Object.freeze([]);

export type FloatingAiSurface = "assist" | "guide";

export type GuideConversationResolver = {
  /**
   * Returns true when tools must be denied.
   * Fail closed: lookup/access failure => true (deny).
   */
  isGuideConversation(conversationId: string): Promise<boolean>;
};

export function conversationStorageKeyForSurface(
  companyId: string,
  surface: FloatingAiSurface,
): string {
  const prefix =
    surface === "guide" ? GUIDE_CONVERSATION_STORAGE_PREFIX : ASSIST_CONVERSATION_STORAGE_PREFIX;
  return `${prefix}:${companyId}`;
}

export function isGuideConversationMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return metadata.source === GUIDE_CONVERSATION_SOURCE;
}

export function isGuidePageContext(
  pageContext: Record<string, unknown> | null | undefined,
): boolean {
  if (!pageContext || typeof pageContext !== "object") return false;
  if (pageContext.guideMode === true) return true;
  if (pageContext.assistantSurface === "guide") return true;
  return false;
}

export function resolveFloatingAiSurface(input: {
  explicitSurface?: FloatingAiSurface | null;
  pageContext?: Record<string, unknown> | null;
  conversationMetadata?: Record<string, unknown> | null;
}): FloatingAiSurface {
  if (input.explicitSurface === "guide" || input.explicitSurface === "assist") {
    return input.explicitSurface;
  }
  if (isGuidePageContext(input.pageContext)) return "guide";
  if (isGuideConversationMetadata(input.conversationMetadata)) return "guide";
  return "assist";
}

export function conversationSourceForSurface(
  surface: FloatingAiSurface,
  chatSource: "floating" | "workspace",
): string {
  if (surface === "guide") return GUIDE_CONVERSATION_SOURCE;
  return chatSource === "floating" ? ASSIST_FLOATING_CONVERSATION_SOURCE : "ai_chat_workspace";
}

export function applyGuidePageContextRestrictions(
  pageContext: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...pageContext,
    guideMode: true,
    assistantSurface: "guide",
    allowedToolKeys: [...GUIDE_ALLOWED_TOOL_KEYS],
    aiEmployeeId: undefined,
  };
}

export function registerGuideToolScope(conversationId: string): void {
  registerConversationToolScope(conversationId, {
    allowedToolKeys: GUIDE_ALLOWED_TOOL_KEYS,
    employeeId: GUIDE_RUNTIME_SCOPE_EMPLOYEE_ID,
    showProductPrices: false,
  });
}

export function isActiveGuideToolScope(conversationId?: string | null): boolean {
  const scope = resolveActiveToolScope(conversationId);
  return scope?.employeeId === GUIDE_RUNTIME_SCOPE_EMPLOYEE_ID;
}

function deniedGuideToolResult(toolKey: string): RuntimeToolRouteResult {
  return {
    executionId: `ai-guide-denied-${Date.now()}`,
    toolKey,
    status: "failed",
    output: {
      denied: true,
      errorCode: AI_GUIDE_TOOL_DENIED_CODE,
      reason: "Tools are not available in AI Guide mode.",
    },
    durationMs: 0,
    errorCode: AI_GUIDE_TOOL_DENIED_CODE,
    errorMessage: "Tool execution is blocked for AI Guide conversations.",
  };
}

/**
 * Defense-in-depth guard. Authoritative lock is conversations.ai_guide_locked
 * enforced inside ToolRouterService / createRuntimeToolPort.
 * This guard is fail-closed on resolver errors.
 */
export function createGuideToolGuard(
  base: RuntimeToolPort,
  resolver: GuideConversationResolver,
): RuntimeToolPort {
  return {
    allowedToolKeys() {
      if (isActiveGuideToolScope()) return [];
      return base.allowedToolKeys();
    },
    listLlmTools() {
      if (isActiveGuideToolScope()) return [];
      return base.listLlmTools();
    },
    async route(
      ctx: ServiceContext,
      input: RuntimeToolRouteInput,
    ): Promise<RuntimeToolRouteResult> {
      if (!input.conversationId) {
        if (isActiveGuideToolScope()) return deniedGuideToolResult(input.toolKey);
        return base.route(ctx, input);
      }

      if (isActiveGuideToolScope(input.conversationId)) {
        return deniedGuideToolResult(input.toolKey);
      }

      let mustDeny = false;
      try {
        mustDeny = await resolver.isGuideConversation(input.conversationId);
      } catch {
        // Fail closed: unavailable classification => deny tools.
        mustDeny = true;
      }

      if (mustDeny) {
        return deniedGuideToolResult(input.toolKey);
      }

      return base.route(ctx, input);
    },
  };
}

/**
 * Trusted Guide classification via SECURITY DEFINER RPC when auth.uid() is present.
 * Service-role / webhook callers have no auth.uid(), so the RPC returns empty — that must
 * NOT be treated as Guide-locked (it would block Public Web Chat + channel AI tools).
 * Fall back to the authoritative conversations.ai_guide_locked column in that case.
 * Missing conversation or read failure still fails closed (deny tools).
 */
export function createGuideConversationResolver(
  client: SupabaseClient,
): GuideConversationResolver {
  const cache = new Map<string, boolean>();

  function remember(conversationId: string, locked: boolean): boolean {
    if (cache.size > 5_000) cache.clear();
    cache.set(conversationId, locked);
    return locked;
  }

  return {
    async isGuideConversation(conversationId: string): Promise<boolean> {
      const cached = cache.get(conversationId);
      if (cached !== undefined) return cached;

      const { data, error } = await client.rpc("resolve_conversation_ai_tool_gate", {
        p_conversation_id: conversationId,
      });

      if (error) {
        throw error;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row === "object") {
        return remember(conversationId, (row as { ai_guide_locked?: boolean }).ai_guide_locked === true);
      }

      // RPC empty: typical for service_role (auth.uid() is null). Read the lock column directly.
      const { data: conv, error: convError } = await client
        .from("conversations")
        .select("ai_guide_locked")
        .eq("id", conversationId)
        .is("deleted_at", null)
        .maybeSingle();

      if (convError) throw convError;
      if (!conv) {
        // Missing conversation => deny tools (fail closed).
        return remember(conversationId, true);
      }

      return remember(conversationId, conv.ai_guide_locked === true);
    },
  };
}
