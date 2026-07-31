export const omnichannelConversationListKey = (
  companyId: string,
  filters: Record<string, unknown>,
) => ["omnichannel", "conversations", companyId, filters] as const;

export const omnichannelMessagesKey = (conversationId: string | null) =>
  ["omnichannel", "messages", conversationId] as const;

export const omnichannelCustomerContextKey = (customerId: string | null) =>
  ["omnichannel", "customer-context", customerId] as const;

export const OMNICHANNEL_LIST_STALE_MS = 10_000;
