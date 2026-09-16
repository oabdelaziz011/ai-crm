/**
 * Customer 360 SMS tab — read model over canonical SMS Workspace data.
 *
 * SoT:
 *   Customer = customers row
 *   SMS = conversations + conversation_messages
 *   Link = conversations.customer_id (exact; never re-match phone on read)
 *   Auth = sms.view + sms_channel (tab/fetch) + conversation visibility (Phase 6D)
 *
 * Customer association is not authorization, assignment, or department ownership.
 * Customer 360 is READ-ONLY — no composer / assignment mutations.
 */
import {
  PermissionDeniedError,
  type ConversationMessageRecord,
  type ConversationRecord,
  type ConversationService,
  type MessageService,
  type ServiceContext,
} from "@workspace/ai-conversation";

export const CUSTOMER_SMS_VIEW_PERMISSION = "sms.view";
export const CUSTOMER_SMS_COMMERCIAL_FEATURE = "sms_channel";
export const CUSTOMER_SMS_PAGE_SIZE = 20;

export type CustomerSmsDirection = "incoming" | "outgoing";

export function canViewCustomerSmsTab(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  /** When provided, must be true (fail-closed on false/undefined for non-admins). */
  smsChannelEntitled?: boolean | null;
}): boolean {
  if (input.isSuperAdmin) return true;
  if (!input.hasPermission(CUSTOMER_SMS_VIEW_PERMISSION)) return false;
  if (input.smsChannelEntitled !== true) return false;
  return true;
}

export function assertCanViewCustomerSmsTab(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  smsChannelEntitled?: boolean | null;
}): void {
  if (!canViewCustomerSmsTab(input)) {
    throw new PermissionDeniedError(CUSTOMER_SMS_VIEW_PERMISSION);
  }
}

export function customerSmsConversationsQueryKey(
  companyId: string | null,
  customerId: string | null,
) {
  return ["conversation-list", companyId, { channelType: "sms" as const, customerId }] as const;
}

export function customerSmsOpenConversationHref(conversationId: string): string {
  const id = conversationId.trim();
  return `~/dashboard/sms?conversation=${encodeURIComponent(id)}`;
}

/**
 * Whether a conversation belongs on this customer's SMS tab.
 * Linkage is conversations.customer_id only — never phone rematch on read.
 */
export function isCustomerLinkedSmsConversation(input: {
  conversation: Pick<ConversationRecord, "company_id" | "channel_type" | "customer_id">;
  companyId: string;
  customerId: string;
}): boolean {
  if (input.conversation.company_id !== input.companyId) return false;
  if (input.conversation.channel_type !== "sms") return false;
  return input.conversation.customer_id === input.customerId;
}

export function filterCustomerSmsConversations(
  rows: readonly ConversationRecord[],
  input: { companyId: string; customerId: string },
): ConversationRecord[] {
  return rows.filter((conversation) =>
    isCustomerLinkedSmsConversation({
      conversation,
      companyId: input.companyId,
      customerId: input.customerId,
    }),
  );
}

export async function listCustomerSmsConversations(input: {
  ctx: ServiceContext;
  conversations: ConversationService;
  companyId: string;
  customerId: string;
  smsChannelEntitled: boolean;
  limit?: number;
  offset?: number;
}): Promise<ConversationRecord[]> {
  assertCanViewCustomerSmsTab({
    isSuperAdmin: input.ctx.isSuperAdmin,
    hasPermission: (code) => input.ctx.hasPermission(code),
    smsChannelEntitled: input.smsChannelEntitled,
  });
  const companyId = input.companyId.trim();
  const customerId = input.customerId.trim();
  if (!companyId || !customerId) return [];

  const rows = await input.conversations.listConversations(input.ctx, {
    companyId,
    channelType: "sms",
    customerId,
    limit: input.limit ?? CUSTOMER_SMS_PAGE_SIZE,
    offset: input.offset ?? 0,
  });

  return filterCustomerSmsConversations(rows, { companyId, customerId });
}

export async function listCustomerSmsThreadMessages(input: {
  ctx: ServiceContext;
  messages: MessageService;
  conversationId: string;
  smsChannelEntitled: boolean;
}): Promise<ConversationMessageRecord[]> {
  assertCanViewCustomerSmsTab({
    isSuperAdmin: input.ctx.isSuperAdmin,
    hasPermission: (code) => input.ctx.hasPermission(code),
    smsChannelEntitled: input.smsChannelEntitled,
  });
  const conversationId = input.conversationId.trim();
  if (!conversationId) return [];
  return input.messages.listMessages(input.ctx, {
    conversationId,
    limit: 200,
    markEmployeeRead: false,
  });
}

export function resolveCustomerSmsDirection(
  conversation: Pick<ConversationRecord, "last_participant_type">,
): CustomerSmsDirection | null {
  if (conversation.last_participant_type === "customer") return "incoming";
  if (
    conversation.last_participant_type === "employee" ||
    conversation.last_participant_type === "assistant"
  ) {
    return "outgoing";
  }
  return null;
}

/** Remote party phone for the SMS thread (canonical external_thread_id). */
export function resolveCustomerSmsThreadPhone(
  conversation: Pick<ConversationRecord, "external_thread_id" | "metadata">,
): string | null {
  const thread = conversation.external_thread_id?.trim();
  if (thread) return thread;
  const metadata = conversation.metadata ?? {};
  for (const key of ["customerPhone", "customer_phone", "phone", "from"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Outbound actor is message created_by / metadata.agentUserId.
 * Never uses conversations.assigned_user_id.
 */
export function resolveCustomerSmsMessageActor(message: ConversationMessageRecord): {
  direction: CustomerSmsDirection | "other";
  sentByUserId: string | null;
} {
  const direction: CustomerSmsDirection | "other" =
    message.message_type === "incoming"
      ? "incoming"
      : message.message_type === "outgoing"
        ? "outgoing"
        : "other";
  if (direction !== "outgoing") {
    return { direction, sentByUserId: null };
  }
  const agent =
    typeof message.metadata?.agentUserId === "string" ? message.metadata.agentUserId.trim() : "";
  const createdBy = message.created_by?.trim() || "";
  return { direction, sentByUserId: agent || createdBy || null };
}

export function customerSmsMessageSnippet(content: string, maxLength = 160): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeCustomerSmsDeliveryStatus(
  status: string | null | undefined,
): "pending" | "sent" | "delivered" | "failed" | "read" | null {
  const raw = String(status ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw === "pending" || raw === "queued" || raw === "sending") return "pending";
  if (raw === "sent") return "sent";
  if (raw === "delivered") return "delivered";
  if (raw === "read") return "read";
  if (raw === "failed" || raw === "undelivered") return "failed";
  return null;
}
