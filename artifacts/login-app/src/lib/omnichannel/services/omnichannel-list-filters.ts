import {
  OMNICHANNEL_PRIMARY_CHANNELS,
  OMNICHANNEL_PUBLIC_WEB_CHAT_CHANNEL,
  type OmnichannelListFilters,
} from "@/lib/omnichannel/types/unified-conversation";

export function mapListFilters(
  filters: OmnichannelListFilters,
  options?: { forceAssignedUserId?: string | null; includePublicWebChat?: boolean },
) {
  const includePublicWebChat = options?.includePublicWebChat === true;
  const channel =
    filters.channel === OMNICHANNEL_PUBLIC_WEB_CHAT_CHANNEL && !includePublicWebChat
      ? undefined
      : filters.channel;
  return {
    searchQuery: filters.search,
    // Canonical Unified Channels scope: primary messaging channels only (no email),
    // plus public widget Live Chat when permitted (never internal AI chat).
    // When the UI picks a single channel chip, narrow further via channelType.
    channelTypes: channel ? undefined : OMNICHANNEL_PRIMARY_CHANNELS,
    channelType: channel,
    includePublicWebChat,
    state: filters.status,
    assignedUserId: options?.forceAssignedUserId ?? filters.assignedUserId,
    hasEmployeeUnread: filters.unreadOnly,
  };
}
