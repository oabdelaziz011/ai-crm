import type { ConversationRecord } from "@workspace/ai-conversation";
import type { OmnichannelListFilters, UnifiedConversation } from "@/lib/omnichannel/types/unified-conversation";
import {
  applyConversationQueue,
  isOpenConversation,
  type OmnichannelQueueFilter,
} from "@/lib/omnichannel/services/conversation-queues";
import { conversationAggregator } from "@/lib/omnichannel/aggregators/conversation-aggregator";
import {
  hasConversationAssignee,
  resolveAssignedToUserId,
} from "@/lib/omnichannel/presentation/conversation-ownership";
import { filterConversationsByChannelPermission } from "@/lib/omnichannel/permissions";
import { OMNICHANNEL_PRIMARY_CHANNELS, isPrimaryOmnichannelChannel } from "@/lib/omnichannel/types/unified-conversation";

export const OMNI_RENDER_TARGET_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
export const OMNI_RENDER_TARGET_NUMBER = "CNV-000010";

export type OmniRenderTrace = {
  at: string;
  stage: string;
  present: boolean;
  index: number | null;
  filtered: boolean;
  filterReason?: string | null;
  reactKey?: string | null;
  total?: number;
  [key: string]: unknown;
};

function pushLog(entry: OmniRenderTrace) {
  console.info("[OMNI_RENDER]", entry.stage, entry);
  if (typeof window !== "undefined") {
    const w = window as unknown as { __OMNI_RENDER_LOGS?: OmniRenderTrace[] };
    w.__OMNI_RENDER_LOGS ??= [];
    w.__OMNI_RENDER_LOGS.push(entry);
  }
}

export function omniRenderTrace(
  stage: string,
  conversations: ReadonlyArray<{ id: string; conversationNumber?: string | null }>,
  extra?: Record<string, unknown>,
): OmniRenderTrace {
  const index = conversations.findIndex((c) => c.id === OMNI_RENDER_TARGET_ID);
  const present = index >= 0;
  const entry: OmniRenderTrace = {
    at: new Date().toISOString(),
    stage,
    targetId: OMNI_RENDER_TARGET_ID,
    targetNumber: OMNI_RENDER_TARGET_NUMBER,
    present,
    index: present ? index : null,
    filtered: !present,
    total: conversations.length,
    reactKey: present ? OMNI_RENDER_TARGET_ID : null,
    ...extra,
  };
  pushLog(entry);
  return entry;
}

function findRawRow(rows: ConversationRecord[]): ConversationRecord | undefined {
  return rows.find((r) => r.id === OMNI_RENDER_TARGET_ID);
}

export function diagnoseApplyFilters(item: UnifiedConversation, filters: OmnichannelListFilters): string | null {
  if (filters.archived === true && !item.isArchived) return "archived=true but conversation.isArchived=false";
  if (filters.archived === false && item.isArchived) return "archived=false but conversation.isArchived=true";
  if (filters.pinnedOnly && !item.isPinned) return "pinnedOnly=true but !isPinned";
  if (filters.unreadOnly && item.unreadCount <= 0) return "unreadOnly=true but unreadCount=0";
  if (filters.channel && item.channel !== filters.channel) return `channel filter ${filters.channel} !== ${item.channel}`;
  if (filters.status && item.status !== filters.status) return `status filter ${filters.status} !== ${item.status}`;
  if (filters.priority && item.priority !== filters.priority) return `priority filter ${filters.priority} !== ${item.priority}`;
  if (filters.assignedUserId && resolveAssignedToUserId(item) !== filters.assignedUserId) {
    return `assignedUserId=${filters.assignedUserId} !== ${resolveAssignedToUserId(item)}`;
  }
  if (filters.assignedOnly && !hasConversationAssignee(item)) return "assignedOnly=true but no assignee";
  if (filters.handlerMode && filters.handlerMode !== "all" && item.handlerMode !== filters.handlerMode) {
    return `handlerMode=${filters.handlerMode} !== ${item.handlerMode}`;
  }
  if (filters.tag?.trim()) {
    const tag = filters.tag.trim().toLowerCase();
    const tags = item.source.metadata?.tags;
    if (!Array.isArray(tags) || !tags.some((e) => String(e).toLowerCase() === tag)) {
      return `tag filter "${filters.tag}" not in metadata.tags`;
    }
  }
  if (filters.search?.trim()) {
    const query = filters.search.trim().toLowerCase();
    const haystack = [
      item.customer?.name,
      item.customer?.phone,
      item.customer?.email,
      item.lastMessage,
      item.channelLabel,
      item.conversationNumber,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return `search="${filters.search}" not in haystack`;
  }
  return null;
}

function diagnoseQueueFilter(item: UnifiedConversation, queue: OmnichannelQueueFilter | undefined, userId: string | null | undefined): string | null {
  const effective = queue ?? "all";
  const inQueue = applyConversationQueue([item], effective, userId).length > 0;
  if (inQueue) return null;

  switch (effective) {
    case "all":
      return `queue=all requires isOpenConversation (status=${item.status}, lifecycle=${item.lifecycleState})`;
    case "unassigned":
      return "queue=unassigned requires !hasAssignee && isOpen";
    case "mine":
      return `queue=mine requires assignedUserId===${userId} (actual=${resolveAssignedToUserId(item)}) && isOpen`;
    case "waiting_customer":
      return `queue=waiting_customer requires PENDING_CUSTOMER/waiting_user (lifecycle=${item.lifecycleState}, status=${item.status})`;
    case "waiting_ai":
      return `queue=waiting_ai requires AI_HANDLING or handlerMode=ai (lifecycle=${item.lifecycleState}, handlerMode=${item.handlerMode})`;
    case "escalated":
      return `queue=escalated requires isEscalated=true (actual=${item.isEscalated}) && isOpen`;
    case "resolved":
      return `queue=resolved requires RESOLVED lifecycle (actual=${item.lifecycleState})`;
    case "closed":
      return `queue=closed requires CLOSED status (actual=${item.lifecycleState}/${item.status})`;
    default:
      return `queue=${effective} excluded conversation`;
  }
}

export function auditRenderPipeline(input: {
  stage: string;
  flatRows: ConversationRecord[];
  filters: OmnichannelListFilters;
  userId: string | null | undefined;
  customersById: Parameters<typeof conversationAggregator.aggregateList>[0]["customersById"];
  agentsById: Parameters<typeof conversationAggregator.aggregateList>[0]["agentsById"];
  profilesByUserId: Parameters<typeof conversationAggregator.aggregateList>[0]["profilesByUserId"];
  ownershipLabels: Parameters<typeof conversationAggregator.aggregateList>[0]["ownershipLabels"];
}) {
  const raw = findRawRow(input.flatRows);
  if (!raw) {
    pushLog({
      at: new Date().toISOString(),
      stage: `${input.stage}.rawQueryRows`,
      targetId: OMNI_RENDER_TARGET_ID,
      targetNumber: OMNI_RENDER_TARGET_NUMBER,
      present: false,
      index: null,
      filtered: true,
      filterReason: "not in useConversationListInfinite flat rows",
      total: input.flatRows.length,
    });
    return;
  }

  omniRenderTrace(`${input.stage}.rawQueryRows`, input.flatRows, {
    filterReason: null,
    conversationNumber: raw.conversation_number,
  });

  const unified = conversationAggregator.aggregateList({
    conversations: input.flatRows,
    customersById: input.customersById,
    agentsById: input.agentsById,
    profilesByUserId: input.profilesByUserId,
    ownershipLabels: input.ownershipLabels,
  });
  const aggregated = unified.find((c) => c.id === OMNI_RENDER_TARGET_ID);
  omniRenderTrace(`${input.stage}.afterAggregateList`, unified, {
    filterReason: aggregated ? null : "missing after aggregateList",
  });
  if (!aggregated) return;

  const supported = conversationAggregator.filterBySupportedChannels(unified);
  if (!supported.some((c) => c.id === OMNI_RENDER_TARGET_ID)) {
    pushLog({
      at: new Date().toISOString(),
      stage: `${input.stage}.afterFilterBySupportedChannels`,
      targetId: OMNI_RENDER_TARGET_ID,
      targetNumber: OMNI_RENDER_TARGET_NUMBER,
      present: false,
      index: null,
      filtered: true,
      filterReason: `channel ${aggregated.channel} isPrimary=${isPrimaryOmnichannelChannel(aggregated.channel)}`,
      total: supported.length,
    });
    return;
  }
  omniRenderTrace(`${input.stage}.afterFilterBySupportedChannels`, supported, { filterReason: null });

  const afterFilters = conversationAggregator.applyFilters(supported, input.filters);
  if (!afterFilters.some((c) => c.id === OMNI_RENDER_TARGET_ID)) {
    pushLog({
      at: new Date().toISOString(),
      stage: `${input.stage}.afterApplyFilters`,
      targetId: OMNI_RENDER_TARGET_ID,
      targetNumber: OMNI_RENDER_TARGET_NUMBER,
      present: false,
      index: null,
      filtered: true,
      filterReason: diagnoseApplyFilters(aggregated, input.filters),
      filters: input.filters,
      total: afterFilters.length,
    });
    return;
  }
  omniRenderTrace(`${input.stage}.afterApplyFilters`, afterFilters, { filterReason: null, filters: input.filters });

  const effectiveQueue = input.filters.queue ?? "all";
  const afterQueue = applyConversationQueue(afterFilters, effectiveQueue, input.userId);
  if (!afterQueue.some((c) => c.id === OMNI_RENDER_TARGET_ID)) {
    pushLog({
      at: new Date().toISOString(),
      stage: `${input.stage}.afterApplyConversationQueue`,
      targetId: OMNI_RENDER_TARGET_ID,
      targetNumber: OMNI_RENDER_TARGET_NUMBER,
      present: false,
      index: null,
      filtered: true,
      filterReason: diagnoseQueueFilter(aggregated, effectiveQueue, input.userId),
      activeQueue: effectiveQueue,
      total: afterQueue.length,
    });
    return;
  }
  omniRenderTrace(`${input.stage}.afterApplyConversationQueue`, afterQueue, { filterReason: null, activeQueue: effectiveQueue });

  const afterChannelPerm = filterConversationsByChannelPermission(afterQueue, OMNICHANNEL_PRIMARY_CHANNELS);
  if (!afterChannelPerm.some((c) => c.id === OMNI_RENDER_TARGET_ID)) {
    pushLog({
      at: new Date().toISOString(),
      stage: `${input.stage}.afterChannelPermission`,
      targetId: OMNI_RENDER_TARGET_ID,
      targetNumber: OMNI_RENDER_TARGET_NUMBER,
      present: false,
      index: null,
      filtered: true,
      filterReason: `channel ${aggregated.channel} not in OMNICHANNEL_PRIMARY_CHANNELS`,
      total: afterChannelPerm.length,
    });
    return;
  }
  omniRenderTrace(`${input.stage}.afterChannelPermission`, afterChannelPerm, { filterReason: null });
}

export function readOmnichannelSessionStorage(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("omnichannel-console-session");
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return { parseError: true };
  }
}

export function auditVirtualizationWindow(input: {
  scrollTop: number;
  viewportHeight: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  rowHeight: number;
}) {
  const index = 0; // will be passed from caller
  return (listIndex: number) => {
    const inWindow = listIndex >= input.startIndex && listIndex < input.endIndex;
    const offsetY = input.startIndex * input.rowHeight;
    const rowTop = listIndex * input.rowHeight - input.scrollTop;
    const rowBottom = rowTop + input.rowHeight;
    const outsideViewport = rowBottom < 0 || rowTop > input.viewportHeight;
    pushLog({
      at: new Date().toISOString(),
      stage: "InboxColumn.virtualization",
      targetId: OMNI_RENDER_TARGET_ID,
      targetNumber: OMNI_RENDER_TARGET_NUMBER,
      present: listIndex >= 0,
      index: listIndex,
      filtered: !inWindow,
      filterReason: inWindow ? null : `virtual window [${input.startIndex}, ${input.endIndex}) excludes index ${listIndex}`,
      virtualizationReceives: inWindow,
      outsideViewport: inWindow ? outsideViewport : true,
      scrollTop: input.scrollTop,
      viewportHeight: input.viewportHeight,
      windowStart: input.startIndex,
      windowEnd: input.endIndex,
      offsetY,
      totalItems: input.totalItems,
      reactKey: OMNI_RENDER_TARGET_ID,
    });
  };
}
