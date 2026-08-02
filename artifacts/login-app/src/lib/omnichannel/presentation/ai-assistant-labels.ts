import i18n from "i18next";
import type { AiAssistantSheetLabels } from "@/components/omnichannel/workspace-v2/ai-assistant-sheet";
import type { SuggestedReplyExplainLabels } from "@/components/omnichannel/agent-desk/suggested-reply-chip";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";

export function getSuggestedReplyExplainLabels(
  language: ResolvedConversationLanguage,
): SuggestedReplyExplainLabels {
  const lng = language === "ar" ? "ar" : "en";
  const t = i18n.getFixedT(lng, "common");
  return {
    title: t("omnichannel.suggestedReplies.explain.title"),
    reason: t("omnichannel.suggestedReplies.explain.reason"),
    signalsUsed: t("omnichannel.suggestedReplies.explain.signalsUsed"),
    intent: t("omnichannel.suggestedReplies.explain.intent"),
    mood: t("omnichannel.suggestedReplies.explain.mood"),
    journey: t("omnichannel.suggestedReplies.explain.journey"),
    knowledgeSource: t("omnichannel.suggestedReplies.explain.knowledgeSource"),
    confidence: t("omnichannel.suggestedReplies.explain.confidence"),
    explainSuggestion: t("omnichannel.suggestedReplies.explain.explainSuggestion"),
    none: t("omnichannel.suggestedReplies.explain.none"),
    signals: {
      last_messages: t("omnichannel.suggestedReplies.explain.signals.last_messages"),
      conversation_summary: t("omnichannel.suggestedReplies.explain.signals.conversation_summary"),
      customer_mood: t("omnichannel.suggestedReplies.explain.signals.customer_mood"),
      intent_classification: t("omnichannel.suggestedReplies.explain.signals.intent_classification"),
      journey_stage: t("omnichannel.suggestedReplies.explain.signals.journey_stage"),
      customer_360: t("omnichannel.suggestedReplies.explain.signals.customer_360"),
      crm_attributes: t("omnichannel.suggestedReplies.explain.signals.crm_attributes"),
      knowledge_retrieval: t("omnichannel.suggestedReplies.explain.signals.knowledge_retrieval"),
    },
    moodLabels: {
      neutral: t("omnichannel.suggestedReplies.explain.moodLabels.neutral"),
      happy: t("omnichannel.suggestedReplies.explain.moodLabels.happy"),
      angry: t("omnichannel.suggestedReplies.explain.moodLabels.angry"),
      urgent: t("omnichannel.suggestedReplies.explain.moodLabels.urgent"),
      confused: t("omnichannel.suggestedReplies.explain.moodLabels.confused"),
    },
  };
}

/** Labels for the AI Assistant sheet follow conversation language, not UI locale. */
export function getAiAssistantLabels(language: ResolvedConversationLanguage): AiAssistantSheetLabels {
  const lng = language === "ar" ? "ar" : "en";
  const t = i18n.getFixedT(lng, "common");
  return {
    title: t("omnichannel.aiAssist.title"),
    suggestedReplies: t("omnichannel.composer.suggestedReplies"),
    rewrite: t("omnichannel.composer.aiRewrite"),
    rewriteOptions: t("omnichannel.aiAssist.rewriteOptions"),
    summarize: t("omnichannel.aiAssist.summary"),
    conversationSummary: t("omnichannel.aiAssist.conversationSummary"),
    improveTone: t("omnichannel.aiAssist.improveTone"),
    translate: t("omnichannel.composer.translate"),
    applyToComposer: t("omnichannel.aiAssist.applyToComposer"),
    copy: t("omnichannel.aiAssist.copy"),
    generate: t("omnichannel.aiAssist.generate"),
    commands: t("omnichannel.aiAssist.commands"),
    unavailable: t("omnichannel.aiAssist.unavailable"),
    runtimeUnavailable: t("omnichannel.aiAssist.runtimeUnavailable"),
    noConversation: t("omnichannel.aiAssist.noConversation"),
    translateUnavailable: t("omnichannel.composer.disabled.translate"),
    rewriteUnavailable: t("omnichannel.aiAssist.rewriteUnavailable"),
    editorTitle: t("omnichannel.aiAssist.editorTitle"),
    editorPlaceholder: t("omnichannel.aiAssist.editorPlaceholder"),
    undo: t("omnichannel.aiAssist.undo"),
    redo: t("omnichannel.aiAssist.redo"),
    clear: t("omnichannel.aiAssist.clear"),
    replace: t("omnichannel.aiAssist.replace"),
    restoreOriginal: t("omnichannel.aiAssist.restoreOriginal"),
    applyShortcut: t("omnichannel.aiAssist.applyShortcut"),
  };
}

export function getAiAssistantButtonLabel(language: ResolvedConversationLanguage): string {
  return getAiAssistantLabels(language).title;
}
