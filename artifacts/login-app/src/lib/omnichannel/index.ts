export * from "@/lib/omnichannel/types/unified-conversation";
export { conversationAggregator, ConversationAggregator } from "@/lib/omnichannel/aggregators/conversation-aggregator";
export {
  mapUnifiedMessage,
  mapUnifiedMessages,
  mergeUnifiedMessagesAcrossChannels,
} from "@/lib/omnichannel/aggregators/message-mapper";
export { buildAiAssistModel } from "@/lib/omnichannel/services/ai-assist-service";
export * from "@/lib/omnichannel/permissions";
export * from "@/lib/conversation-lifecycle";
export { computeConversationListWindow } from "@/lib/omnichannel/virtualization/conversation-list-window";
