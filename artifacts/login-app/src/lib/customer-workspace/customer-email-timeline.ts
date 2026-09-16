/**
 * Customer 360 Email tab — read model over canonical Email Workspace data.
 *
 * SoT:
 *   Customer = customers row (single `email`)
 *   Email = conversations + conversation_messages
 *   Link = conversations.customer_id (set by inbound identity / compose exact match)
 *   Auth = email.view (tab) + existing conversation visibility (Phase 6D)
 *
 * Customer association is not authorization, assignment, or department ownership.
 */
import {
  PermissionDeniedError,
  type ConversationMessageRecord,
  type ConversationRecord,
  type ConversationService,
  type MessageService,
  type ServiceContext,
} from "@workspace/ai-conversation";
import { customerEmailMatchesEmailSender } from "@workspace/ai-tool-router";

export const CUSTOMER_EMAIL_VIEW_PERMISSION = "email.view";
export const CUSTOMER_EMAIL_PAGE_SIZE = 20;

export type CustomerEmailDirection = "incoming" | "outgoing";

export function canViewCustomerEmailTab(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
}): boolean {
  if (input.isSuperAdmin) return true;
  return input.hasPermission(CUSTOMER_EMAIL_VIEW_PERMISSION);
}

export function assertCanViewCustomerEmailTab(input: {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
}): void {
  if (!canViewCustomerEmailTab(input)) {
    throw new PermissionDeniedError(CUSTOMER_EMAIL_VIEW_PERMISSION);
  }
}

export function customerEmailConversationsQueryKey(
  companyId: string | null,
  customerId: string | null,
) {
  return ["conversation-list", companyId, { channelType: "email" as const, customerId }] as const;
}

export function customerEmailOpenConversationHref(conversationId: string): string {
  const id = conversationId.trim();
  return `~/dashboard/email?conversation=${encodeURIComponent(id)}`;
}

/** Exact company-scoped email identity. No name / subject / body / fuzzy matching. */
export function customerEmailIdentityMatches(input: {
  customerEmail: string | null | undefined;
  candidateEmail: string | null | undefined;
}): boolean {
  return customerEmailMatchesEmailSender(input.customerEmail, input.candidateEmail);
}

/**
 * Whether a conversation belongs on this customer's Email tab.
 * Linkage is conversations.customer_id only — never "customer owns email ⇒ visible".
 */
export function isCustomerLinkedEmailConversation(input: {
  conversation: Pick<ConversationRecord, "company_id" | "channel_type" | "customer_id">;
  companyId: string;
  customerId: string;
}): boolean {
  if (input.conversation.company_id !== input.companyId) return false;
  if (input.conversation.channel_type !== "email") return false;
  return input.conversation.customer_id === input.customerId;
}

export function filterCustomerEmailConversations(
  rows: readonly ConversationRecord[],
  input: { companyId: string; customerId: string },
): ConversationRecord[] {
  return rows.filter((conversation) =>
    isCustomerLinkedEmailConversation({
      conversation,
      companyId: input.companyId,
      customerId: input.customerId,
    }),
  );
}

export async function listCustomerEmailConversations(input: {
  ctx: ServiceContext;
  conversations: ConversationService;
  companyId: string;
  customerId: string;
  limit?: number;
  offset?: number;
}): Promise<ConversationRecord[]> {
  assertCanViewCustomerEmailTab(input.ctx);
  const companyId = input.companyId.trim();
  const customerId = input.customerId.trim();
  if (!companyId || !customerId) return [];

  const rows = await input.conversations.listConversations(input.ctx, {
    companyId,
    channelType: "email",
    customerId,
    limit: input.limit ?? CUSTOMER_EMAIL_PAGE_SIZE,
    offset: input.offset ?? 0,
  });

  return filterCustomerEmailConversations(rows, { companyId, customerId });
}

export async function listCustomerEmailThreadMessages(input: {
  ctx: ServiceContext;
  messages: MessageService;
  conversationId: string;
}): Promise<ConversationMessageRecord[]> {
  assertCanViewCustomerEmailTab(input.ctx);
  const conversationId = input.conversationId.trim();
  if (!conversationId) return [];
  return input.messages.listMessages(input.ctx, {
    conversationId,
    limit: 200,
    markEmployeeRead: false,
  });
}

export function resolveCustomerEmailDirection(
  conversation: Pick<ConversationRecord, "last_participant_type">,
): CustomerEmailDirection | null {
  if (conversation.last_participant_type === "customer") return "incoming";
  if (
    conversation.last_participant_type === "employee" ||
    conversation.last_participant_type === "assistant"
  ) {
    return "outgoing";
  }
  return null;
}

function readEmailAddress(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed.includes("@") ? trimmed : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.email === "string") {
    const trimmed = record.email.trim().toLowerCase();
    return trimmed.includes("@") ? trimmed : null;
  }
  if (typeof record.address === "string") {
    const trimmed = record.address.trim().toLowerCase();
    return trimmed.includes("@") ? trimmed : null;
  }
  return null;
}

function readEmailAddressList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map(readEmailAddress).filter((v): v is string => Boolean(v)))];
  }
  const single = readEmailAddress(value);
  return single ? [single] : [];
}

export function readCustomerEmailParticipants(metadata: Record<string, unknown> | null | undefined): {
  from: string | null;
  to: string[];
} {
  const meta = metadata ?? {};
  const from = readEmailAddress(meta.from) ?? readEmailAddress(meta.senderExternalId);
  const to = [
    ...readEmailAddressList(meta.to),
    ...readEmailAddressList(meta.recipientEmails),
    ...(typeof meta.recipientEmail === "string" ? readEmailAddressList(meta.recipientEmail) : []),
  ];
  return { from, to: [...new Set(to)] };
}

/**
 * Outbound actor is message created_by / metadata.agentUserId.
 * Never uses conversations.assigned_user_id.
 */
export function resolveCustomerEmailMessageActor(message: ConversationMessageRecord): {
  direction: CustomerEmailDirection | "other";
  sentByUserId: string | null;
} {
  const direction: CustomerEmailDirection | "other" =
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

export function customerEmailMessageSnippet(content: string, maxLength = 160): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
