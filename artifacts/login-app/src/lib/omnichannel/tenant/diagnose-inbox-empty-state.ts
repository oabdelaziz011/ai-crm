import type { OmnichannelListFilters } from "@/lib/omnichannel/types/unified-conversation";
import type { WorkspaceNavId } from "@/components/omnichannel/workspace-v2/workspace-nav";

export type InboxEmptyReasonCode =
  | "loading"
  | "no_conversations"
  | "no_whatsapp_for_tenant"
  | "queue_mine"
  | "queue_ai"
  | "queue_assigned"
  | "queue_escalated"
  | "queue_waiting"
  | "queue_closed"
  | "queue_archived"
  | "search"
  | "channel_filter"
  | "client_filters";

export type InboxEmptyDiagnosis = {
  code: InboxEmptyReasonCode;
  rawRowCount: number;
  visibleCount: number;
  activeNav: WorkspaceNavId;
  searchQuery?: string;
  channelFilter?: string;
};

export function diagnoseInboxEmptyState(input: {
  isLoading: boolean;
  rawRowCount: number;
  visibleCount: number;
  activeNav: WorkspaceNavId;
  filters: OmnichannelListFilters;
  hasWhatsAppChannel: boolean;
}): InboxEmptyDiagnosis | null {
  if (input.isLoading) {
    return { code: "loading", rawRowCount: input.rawRowCount, visibleCount: input.visibleCount, activeNav: input.activeNav };
  }

  if (input.visibleCount > 0) {
    return null;
  }

  if (input.filters.search?.trim()) {
    return {
      code: "search",
      rawRowCount: input.rawRowCount,
      visibleCount: input.visibleCount,
      activeNav: input.activeNav,
      searchQuery: input.filters.search.trim(),
    };
  }

  if (input.filters.channel) {
    return {
      code: "channel_filter",
      rawRowCount: input.rawRowCount,
      visibleCount: input.visibleCount,
      activeNav: input.activeNav,
      channelFilter: input.filters.channel,
    };
  }

  if (input.rawRowCount === 0 && !input.hasWhatsAppChannel) {
    return {
      code: "no_whatsapp_for_tenant",
      rawRowCount: 0,
      visibleCount: 0,
      activeNav: input.activeNav,
    };
  }

  if (input.rawRowCount === 0) {
    return {
      code: "no_conversations",
      rawRowCount: 0,
      visibleCount: 0,
      activeNav: input.activeNav,
    };
  }

  const queueCode = queueReasonFromNav(input.activeNav);
  if (queueCode) {
    return {
      code: queueCode,
      rawRowCount: input.rawRowCount,
      visibleCount: input.visibleCount,
      activeNav: input.activeNav,
    };
  }

  if (input.rawRowCount > 0) {
    return {
      code: "client_filters",
      rawRowCount: input.rawRowCount,
      visibleCount: input.visibleCount,
      activeNav: input.activeNav,
    };
  }

  return null;
}

function queueReasonFromNav(nav: WorkspaceNavId): InboxEmptyReasonCode | null {
  switch (nav) {
    case "mine":
      return "queue_mine";
    case "ai":
      return "queue_ai";
    case "assigned":
      return "queue_assigned";
    case "escalated":
      return "queue_escalated";
    case "waiting":
      return "queue_waiting";
    case "closed":
      return "queue_closed";
    case "archived":
      return "queue_archived";
    default:
      return null;
  }
}

export function isWhatsAppCompanyChannel(
  channel: { communication_channel?: { key?: string } | null; is_enabled?: boolean; deleted_at?: string | null },
): boolean {
  return channel.communication_channel?.key === "whatsapp" && channel.is_enabled !== false && !channel.deleted_at;
}
