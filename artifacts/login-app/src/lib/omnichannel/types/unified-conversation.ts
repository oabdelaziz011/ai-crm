import type {
  ConversationChannelType,
  ConversationMessageRecord,
  ConversationPriority,
  ConversationRecord,
  ConversationState,
  MessageStatus,
  MessageType,
} from "@workspace/ai-conversation";
import type { LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import type { DetectedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import type { OutboundDeliveryPhase } from "@/lib/omnichannel/services/outbound-delivery";
import type { OmnichannelQueueFilter } from "@/lib/omnichannel/services/conversation-queues";
import type { OwnershipTier } from "@/lib/omnichannel/presentation/conversation-ownership";
import type { IntelligentSuggestedReply } from "@/lib/omnichannel/types/suggested-reply-types";

export const OMNICHANNEL_PRIMARY_CHANNELS = [
  "whatsapp",
  "email",
  "messenger",
  "instagram",
] as const;

export const OMNICHANNEL_FUTURE_CHANNELS = [
  "sms",
  "telegram",
  "web_chat",
  "teams",
  "slack",
] as const;

export type OmnichannelPrimaryChannel = (typeof OMNICHANNEL_PRIMARY_CHANNELS)[number];
export type OmnichannelFutureChannel = (typeof OMNICHANNEL_FUTURE_CHANNELS)[number];
export type OmnichannelChannelKey = ConversationChannelType;

export type OmnichannelCustomerRef = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export type OmnichannelAgentRef = {
  id: string;
  name: string;
};

export type UnifiedConversation = {
  id: string;
  companyId: string;
  customer: OmnichannelCustomerRef | null;
  channel: OmnichannelChannelKey;
  channelLabel: string;
  lastMessage: string | null;
  lastActivityAt: string | null;
  assignedAgent: OmnichannelAgentRef | null;
  handlerMode: "ai" | "human" | "mixed";
  lifecycleState: LifecycleState;
  isEscalated: boolean;
  ownerLabel: string | null;
  ownershipTier: OwnershipTier;
  assignedToUserId: string | null;
  priority: ConversationPriority;
  status: ConversationState;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  conversationNumber: string;
  companyChannelId: string | null;
  externalThreadId: string | null;
  source: ConversationRecord;
};

export type UnifiedMessage = {
  id: string;
  conversationId: string;
  channel: OmnichannelChannelKey;
  senderType: "customer" | "agent" | "assistant" | "system" | "automation";
  senderLabel: string;
  timestamp: string;
  body: string;
  deliveryStatus: MessageStatus;
  outboundPhase?: OutboundDeliveryPhase;
  contentType: ConversationMessageRecord["content_type"];
  attachments: UnifiedMessageAttachment[];
  aiActionLabel: string | null;
  automationActionLabel: string | null;
  isInternalNote: boolean;
  source: ConversationMessageRecord;
};

export type UnifiedMessageAttachment = {
  type: string;
  url: string | null;
  mimeType: string | null;
  fileSize: number | null;
  name?: string | null;
};

export type OmnichannelListFilters = {
  search?: string;
  channel?: OmnichannelChannelKey;
  status?: ConversationState;
  priority?: ConversationPriority;
  assignedUserId?: string | null;
  handlerMode?: "ai" | "human" | "all";
  unreadOnly?: boolean;
  pinnedOnly?: boolean;
  archived?: boolean;
  assignedOnly?: boolean;
  queue?: OmnichannelQueueFilter;
  tag?: string;
  sortBy?: "last_activity" | "priority" | "unread";
  sortDirection?: "asc" | "desc";
};

export type CustomerTone = "neutral" | "happy" | "angry" | "urgent" | "confused";

export type OmnichannelAiAssistModel = {
  suggestedReplies: IntelligentSuggestedReply[];
  knowledgeSuggestions: string[];
  sentiment: "positive" | "neutral" | "negative" | "unknown";
  customerTone: CustomerTone;
  summary: string;
  intent: string;
  priority: ConversationPriority;
  escalationRecommended: boolean;
  translationPlaceholder: string;
  detectedLanguage: DetectedConversationLanguage;
  resolvedLanguage: "ar" | "en";
  /** Language used to generate suggested reply chips. */
  suggestedReplyTargetLanguage: "ar" | "en";
  /** Alias for AI generation/runtime consumers. */
  targetLanguage: "ar" | "en";
  languageLabel: string;
  confidence: number;
};

export type OmnichannelCustomerContext = {
  customer: OmnichannelCustomerRef | null;
  openTickets: number;
  recentBookings: number;
  outstandingInvoices: number;
  timelinePreview: string[];
  knowledgeSuggestions: string[];
  recentAiActions: string[];
};

export type OmnichannelComposerMode = "reply" | "internal_note";

export type OmnichannelComposerDraft = {
  text: string;
  mode: OmnichannelComposerMode;
  attachments: UnifiedMessageAttachment[];
  templateId: string | null;
  variables: Record<string, string>;
};

export function isPrimaryOmnichannelChannel(
  channel: string,
): channel is OmnichannelPrimaryChannel {
  return (OMNICHANNEL_PRIMARY_CHANNELS as readonly string[]).includes(channel);
}

export function messageTypeToSenderType(messageType: MessageType): UnifiedMessage["senderType"] {
  if (messageType === "incoming") return "customer";
  if (messageType === "outgoing") return "agent";
  if (messageType === "internal_note") return "agent";
  return "system";
}
