export * from "@/lib/omnichannel/types/unified-conversation";
export { conversationAggregator, ConversationAggregator } from "@/lib/omnichannel/aggregators/conversation-aggregator";
export {
  mapUnifiedMessage,
  mapUnifiedMessages,
  mergeUnifiedMessagesAcrossChannels,
} from "@/lib/omnichannel/aggregators/message-mapper";
export { buildAiAssistModel, buildSuggestedReplyGenerationPrompt } from "@/lib/omnichannel/services/ai-assist-service";
export { buildSuggestedRepliesFromCatalog } from "@/lib/omnichannel/services/suggested-reply-catalog";
export {
  buildIntelligentSuggestedReplies,
  classifySuggestedReplyIntent,
} from "@/lib/omnichannel/services/suggested-reply-intelligence-service";
export { resolveSuggestedReplyTargetLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
export type {
  IntelligentSuggestedReply,
  SuggestedReplyExplanation,
  SuggestedReplyIntentKey,
  SuggestedReplySignal,
} from "@/lib/omnichannel/types/suggested-reply-types";
export * from "@/lib/omnichannel/permissions";
export * from "@/lib/conversation-lifecycle";
export { computeConversationListWindow } from "@/lib/omnichannel/virtualization/conversation-list-window";
