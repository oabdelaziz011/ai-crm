import { buildIntelligentSuggestedReplies } from "@/lib/omnichannel/services/suggested-reply-intelligence-service";
import type { IntelligentSuggestedReply } from "@/lib/omnichannel/types/suggested-reply-types";
import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import type { LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import type {
  CustomerTone,
  OmnichannelCustomerContext,
} from "@/lib/omnichannel/types/unified-conversation";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import { isAuthenticatedApiConfigured } from "@/lib/api-server/normalize-api-base";

export type BuildContextualSuggestedRepliesInput = {
  companyId: string;
  conversationId: string;
  messages: ConversationMessageRecord[];
  summary: string;
  customerTone: CustomerTone;
  targetLanguage: ResolvedConversationLanguage;
  intent: string;
  lifecycleState?: LifecycleState;
  knowledgeSuggestions?: string[];
  customerContext?: OmnichannelCustomerContext | null;
  refreshSeed?: number;
  /** Prefer LLM; fall back to catalog on failure. */
  preferLlm?: boolean;
};

function mapLlmTextsToIntelligentReplies(
  texts: string[],
  fallback: IntelligentSuggestedReply[],
): IntelligentSuggestedReply[] {
  return texts.map((text, index) => {
    const base = fallback[index] ?? fallback[0];
    return {
      id: `llm-${index}-${text.slice(0, 24)}`,
      text,
      confidence: base?.confidence ?? Math.max(60, 90 - index * 4),
      intent: base?.intent ?? "general",
      explanation: base?.explanation ?? {
        reason: "Generated from current conversation context.",
        signalsUsed: ["last_messages", "intent_classification"],
        intent: "Contextual reply",
        mood: "neutral",
        journey: "Active support",
        knowledgeSource: null,
        confidence: Math.max(60, 90 - index * 4),
      },
    } satisfies IntelligentSuggestedReply;
  });
}

function buildCatalogFallback(input: BuildContextualSuggestedRepliesInput): IntelligentSuggestedReply[] {
  return buildIntelligentSuggestedReplies({
    messages: input.messages,
    summary: input.summary,
    customerTone: input.customerTone,
    targetLanguage: input.targetLanguage,
    lifecycleState: input.lifecycleState,
    knowledgeSuggestions: input.knowledgeSuggestions,
    customerContext: input.customerContext,
    variantOffset: input.refreshSeed ?? 0,
    limit: 4,
  });
}

/**
 * Real LLM suggested replies via existing Platform AI proxy.
 * Falls back to intelligent catalog when LLM/API/quota fails.
 */
export async function buildContextualSuggestedReplies(
  input: BuildContextualSuggestedRepliesInput,
): Promise<{ replies: IntelligentSuggestedReply[]; source: "llm" | "catalog"; error?: string }> {
  const catalog = buildCatalogFallback(input);
  const preferLlm = input.preferLlm !== false;

  if (!preferLlm || !input.companyId.trim() || !input.conversationId.trim()) {
    return { replies: catalog, source: "catalog" };
  }

  if (!isAuthenticatedApiConfigured()) {
    return { replies: catalog, source: "catalog", error: "api_not_configured" };
  }

  try {
    // Dynamic import keeps unit tests free of browser Supabase env bootstrap.
    const { platformAiSuggestedReplies } = await import("@/lib/platform-ai/platform-ai-api-client");
    const language = input.targetLanguage === "ar" ? "ar" : "en";
    const response = await platformAiSuggestedReplies({
      companyId: input.companyId,
      conversationId: input.conversationId,
      targetLanguage: language,
      tone: input.customerTone,
      intent: input.intent,
      refreshSeed: input.refreshSeed ?? 0,
    });

    const texts = (response.suggestions ?? [])
      .map((entry) => (typeof entry?.text === "string" ? entry.text.trim() : ""))
      .filter(Boolean);

    if (texts.length < 3) {
      return { replies: catalog, source: "catalog", error: "insufficient_llm_suggestions" };
    }

    return {
      replies: mapLlmTextsToIntelligentReplies(texts.slice(0, 5), catalog),
      source: "llm",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "llm_failed";
    return { replies: catalog, source: "catalog", error: message };
  }
}
