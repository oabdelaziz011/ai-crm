/**
 * Email Workspace conversation-list presentation (display-only).
 * Never mutates stored template source or invents customer data.
 */
import type { ConversationRecord } from "@workspace/ai-conversation";
import { emailDraftHasDiscardableContent } from "@/lib/email-workspace/email-compose-discard";
import {
  isNewEmailComposeConversation,
} from "@/lib/email-workspace/email-compose-new";
import { htmlToPlainText } from "@/lib/email-workspace/email-composer-rich-text";
import {
  isDiscardedEmailComposeConversation,
  parseRecipientList,
  readEmailComposerDraft,
  serializeRecipientListForDisplay,
  type EmailComposerDraftState,
} from "@/lib/email-workspace/email-thread-outbound";
import { hasActiveEmailWorkspaceDraft } from "@/lib/email-workspace/email-workspace-draft-integrity";

const UNRESOLVED_TOKEN_RE = /\{\{\s*[a-z0-9_.]+\s*\}\}/gi;
const EMAIL_LIST_PREVIEW_MAX = 140;

export type EmailWorkspaceListCustomer = {
  id: string;
  companyId: string;
  name: string | null;
  email: string | null;
};

export type EmailWorkspaceListStatus = "draft" | "sending" | "sent" | "failed" | null;

export type EmailWorkspaceListLastDirection = "incoming" | "outgoing" | null;

export type EmailWorkspaceListItemDisplay = {
  primary: string;
  primaryIsEmail: boolean;
  subject: string | null;
  preview: string | null;
  /** True when both subject and body/preview sources are empty — UI shows localized "no preview". */
  showNoPreview: boolean;
  status: EmailWorkspaceListStatus;
  activityAt: string | null;
  conversationNumber: string | null;
  hasContentfulDraft: boolean;
  /** Display-only: last mail direction from last_participant_type. Does not change sort/buckets. */
  lastDirection: EmailWorkspaceListLastDirection;
};

export type EmailWorkspaceListLabels = {
  newEmail: string;
  noSubject: string;
};

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

/** Resolve known tokens; strip unresolved mustache so list never shows raw {{customer.name}}. */
export function formatEmailListTemplateDisplay(
  text: string,
  variables: Record<string, string | null | undefined> = {},
): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";

  const resolved = raw.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_match, key: string) => {
    const normalized = String(key).trim().toLowerCase();
    const value = variables[normalized];
    if (typeof value === "string" && value.trim()) return value.trim();
    return "";
  });

  return resolved
    .replace(UNRESOLVED_TOKEN_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** HTML or plain draft body → single-line list preview. */
export function buildEmailListPlainPreview(input: {
  html?: string | null;
  plain?: string | null;
  maxLength?: number;
}): string {
  const fromHtml = input.html?.trim() ? htmlToPlainText(input.html) : "";
  const plain = firstNonEmpty(fromHtml, input.plain) ?? "";
  if (!plain) return "";
  const collapsed = plain
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " — ")
    .replace(/\s+/g, " ")
    .trim();
  const max = input.maxLength ?? EMAIL_LIST_PREVIEW_MAX;
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function draftHasContentfulListBody(draft: EmailComposerDraftState | null): boolean {
  if (!draft) return false;
  return emailDraftHasDiscardableContent({
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    bodyPlain: firstNonEmpty(
      draft.bodyHtml ? htmlToPlainText(draft.bodyHtml) : null,
      draft.body,
    ) ?? "",
    attachmentCount: draft.attachments?.length ?? 0,
  });
}

export function readEmailListDraftFields(metadata: Record<string, unknown> | null | undefined): {
  draft: EmailComposerDraftState | null;
  subjectRaw: string | null;
  toRaw: string;
  bodyPlain: string;
  bodyHtml: string | null;
  updatedAt: string | null;
  hasContentfulDraft: boolean;
} {
  const draft = readEmailComposerDraft(metadata);
  const subjectFromMeta =
    typeof metadata?.subject === "string" && metadata.subject.trim() ? metadata.subject.trim() : null;
  const subjectRaw = firstNonEmpty(draft?.subject, subjectFromMeta);
  const bodyHtml = draft?.bodyHtml?.trim() ? draft.bodyHtml : null;
  const bodyPlain =
    buildEmailListPlainPreview({
      html: bodyHtml,
      plain: draft?.body ?? null,
      maxLength: 10_000,
    }) || "";
  return {
    draft,
    subjectRaw,
    toRaw: draft?.to?.length ? serializeRecipientListForDisplay(draft.to) : "",
    bodyPlain,
    bodyHtml,
    updatedAt: draft?.updatedAt?.trim() || null,
    hasContentfulDraft: draftHasContentfulListBody(draft),
  };
}

function firstRecipientIdentity(toRaw: string): { email: string | null; displayName: string | null } {
  const recipients = parseRecipientList(toRaw);
  const first = recipients[0]?.trim() ?? "";
  if (!first) return { email: null, displayName: null };
  const angle = first.match(/^(.*?)<\s*([^>]+@[^>]+)\s*>$/);
  if (angle) {
    const name = angle[1]?.trim().replace(/^["']|["']$/g, "") || null;
    const email = angle[2]?.trim().toLowerCase() || null;
    return { email, displayName: name };
  }
  if (first.includes("@")) return { email: first.toLowerCase(), displayName: null };
  return { email: null, displayName: first };
}

export function resolveEmailWorkspaceListIdentity(input: {
  conversation: Pick<ConversationRecord, "customer_id" | "company_id" | "last_participant_type">;
  companyId: string;
  customer?: EmailWorkspaceListCustomer | null;
  draftTo?: string;
  labels: EmailWorkspaceListLabels;
}): { primary: string; primaryIsEmail: boolean } {
  const customer =
    input.customer &&
    input.customer.companyId === input.companyId &&
    input.conversation.customer_id === input.customer.id
      ? input.customer
      : null;

  const customerName = customer?.name?.trim() || null;
  if (customerName) return { primary: customerName, primaryIsEmail: false };

  const recipient = firstRecipientIdentity(input.draftTo ?? "");
  if (recipient.displayName) return { primary: recipient.displayName, primaryIsEmail: false };
  if (recipient.email) return { primary: recipient.email, primaryIsEmail: true };

  const customerEmail = customer?.email?.trim() || null;
  if (customerEmail) return { primary: customerEmail, primaryIsEmail: true };

  return { primary: input.labels.newEmail, primaryIsEmail: false };
}

export function deriveEmailWorkspaceListStatus(input: {
  hasContentfulDraft: boolean;
  isSending?: boolean;
  lastParticipantType?: ConversationRecord["last_participant_type"];
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  outboundFailure?: boolean;
}): EmailWorkspaceListStatus {
  if (input.isSending) return "sending";
  if (input.hasContentfulDraft) return "draft";
  if (input.outboundFailure) return "failed";
  const hasMessage = Boolean(input.lastMessageAt || input.lastMessagePreview?.trim());
  if (hasMessage && (input.lastParticipantType === "employee" || input.lastParticipantType === "assistant")) {
    return "sent";
  }
  return null;
}

/**
 * List ordering timestamp for Email Workspace.
 * Intentionally omits conversation.updated_at: mark-as-read, assignment, and
 * metadata writes bump updated_at but are NOT email activity and must not reorder.
 *
 * Prefer last_message_at (real mail activity) over draft.updatedAt. Opening a thread
 * must never move Inbox/Sent/Pending; draft.updatedAt is only a fallback for
 * Pending compose shells that have no message activity yet.
 */
export function emailWorkspaceListActivityAt(input: {
  draftUpdatedAt?: string | null;
  lastMessageAt?: string | null;
  createdAt?: string | null;
}): string | null {
  return firstNonEmpty(input.lastMessageAt, input.draftUpdatedAt, input.createdAt) ?? null;
}

function conversationHasSuccessfulOutbound(conversation: ConversationRecord): boolean {
  return (
    Boolean(conversation.last_message_at || conversation.last_message_preview?.trim()) &&
    (conversation.last_participant_type === "employee" ||
      conversation.last_participant_type === "assistant")
  );
}

/** Sort/display activity instant for one conversation (shared source of truth). */
export function resolveEmailWorkspaceListSortAt(conversation: ConversationRecord): string | null {
  const hasSuccessfulOutbound = conversationHasSuccessfulOutbound(conversation);
  const fields = readEmailListDraftFields(conversation.metadata);
  const activeDraft = hasActiveEmailWorkspaceDraft({
    metadata: conversation.metadata,
    hasSuccessfulOutbound,
    latestOutboundStatus: hasSuccessfulOutbound ? "sent" : null,
  });
  // draft.updatedAt only when there is no mail activity — otherwise open/autosave
  // bumps would reorder Sent and Pending reply drafts.
  const draftUpdatedAt =
    activeDraft && !conversation.last_message_at ? fields.updatedAt : null;
  return emailWorkspaceListActivityAt({
    draftUpdatedAt,
    lastMessageAt: conversation.last_message_at,
    createdAt: conversation.created_at,
  });
}

export function buildEmailWorkspaceListItemDisplay(input: {
  conversation: ConversationRecord;
  companyId: string;
  customer?: EmailWorkspaceListCustomer | null;
  labels: EmailWorkspaceListLabels;
  isSending?: boolean;
  templateVariables?: Record<string, string | null | undefined>;
}): EmailWorkspaceListItemDisplay {
  const fields = readEmailListDraftFields(input.conversation.metadata);
  const variables: Record<string, string | null | undefined> = {
    ...(input.templateVariables ?? {}),
  };
  if (input.customer && input.customer.companyId === input.companyId) {
    if (input.customer.name?.trim()) variables["customer.name"] = input.customer.name.trim();
    if (input.customer.email?.trim()) variables["customer.email"] = input.customer.email.trim();
  }

  const subjectDisplay = fields.subjectRaw
    ? formatEmailListTemplateDisplay(fields.subjectRaw, variables) || null
    : null;

  const draftPreviewRaw = fields.bodyPlain
    ? formatEmailListTemplateDisplay(fields.bodyPlain, variables)
    : "";
  const draftPreview = draftPreviewRaw
    ? buildEmailListPlainPreview({ plain: draftPreviewRaw })
    : "";

  const messagePreviewRaw = input.conversation.last_message_preview?.trim()
    ? formatEmailListTemplateDisplay(input.conversation.last_message_preview, variables)
    : "";
  const messagePreview = messagePreviewRaw
    ? buildEmailListPlainPreview({ plain: messagePreviewRaw })
    : "";

  const preview = firstNonEmpty(messagePreview, draftPreview, subjectDisplay);
  const showNoPreview = !subjectDisplay && !preview;

  const identity = resolveEmailWorkspaceListIdentity({
    conversation: input.conversation,
    companyId: input.companyId,
    customer: input.customer,
    draftTo: fields.toRaw,
    labels: input.labels,
  });

  const hasSuccessfulOutbound = conversationHasSuccessfulOutbound(input.conversation);

  const hasContentfulActiveDraft = hasActiveEmailWorkspaceDraft({
    metadata: input.conversation.metadata,
    hasSuccessfulOutbound,
    latestOutboundStatus: hasSuccessfulOutbound ? "sent" : null,
  });

  const outboundFailure =
    input.conversation.metadata?.emailLastOutboundStatus === "failed" ||
    input.conversation.metadata?.lastOutboundStatus === "failed";

  const status = deriveEmailWorkspaceListStatus({
    hasContentfulDraft: hasContentfulActiveDraft,
    isSending: input.isSending,
    lastParticipantType: input.conversation.last_participant_type,
    lastMessagePreview: input.conversation.last_message_preview,
    lastMessageAt: input.conversation.last_message_at,
    outboundFailure: Boolean(outboundFailure),
  });

  const lastParticipant = input.conversation.last_participant_type;
  const lastDirection: EmailWorkspaceListLastDirection =
    lastParticipant === "customer"
      ? "incoming"
      : lastParticipant === "employee" || lastParticipant === "assistant"
        ? "outgoing"
        : null;

  return {
    primary: identity.primary,
    primaryIsEmail: identity.primaryIsEmail,
    subject: subjectDisplay,
    preview,
    showNoPreview,
    status,
    activityAt: resolveEmailWorkspaceListSortAt(input.conversation),
    conversationNumber: input.conversation.conversation_number || null,
    hasContentfulDraft: hasContentfulActiveDraft,
    lastDirection,
  };
}

/**
 * Shared Inbox / Pending bucket for Email Workspace lists.
 * Source of truth: conversation.metadata.emailComposerDraft via hasActiveEmailWorkspaceDraft.
 * - pending: active unsent draft (reply/reply-all/forward/compose)
 * - discarded: soft-discarded empty New Email shell (hidden from Inbox)
 * - inbox: everything else that should appear as pending-response mail
 */
export type EmailWorkspaceListBucket = "inbox" | "pending" | "discarded";

export function classifyEmailWorkspaceListBucket(
  conversation: ConversationRecord,
): EmailWorkspaceListBucket {
  if (isDiscardedEmailComposeConversation(conversation.metadata)) return "discarded";

  const hasSuccessfulOutbound = conversationHasSuccessfulOutbound(conversation);

  if (
    hasActiveEmailWorkspaceDraft({
      metadata: conversation.metadata,
      hasSuccessfulOutbound,
      latestOutboundStatus: hasSuccessfulOutbound ? "sent" : null,
    })
  ) {
    return "pending";
  }
  return "inbox";
}

/** True when the conversation belongs in the Email Workspace Inbox list. */
export function isEmailWorkspaceInboxConversation(conversation: ConversationRecord): boolean {
  return classifyEmailWorkspaceListBucket(conversation) === "inbox";
}

/** True when the conversation belongs in Pending (Drafts) list. */
export function isEmailWorkspacePendingConversation(conversation: ConversationRecord): boolean {
  return classifyEmailWorkspaceListBucket(conversation) === "pending";
}

export function sortEmailWorkspaceConversations(
  rows: ConversationRecord[],
): ConversationRecord[] {
  return [...rows].sort((a, b) => {
    const aAt = resolveEmailWorkspaceListSortAt(a) ?? "";
    const bAt = resolveEmailWorkspaceListSortAt(b) ?? "";
    return bAt.localeCompare(aAt);
  });
}

/**
 * Empty New Email compose shell that can be reused instead of creating duplicates.
 * Does not hide contentful drafts; only matches unused empty shells.
 */
export function isReusableEmptyNewEmailComposeShell(
  conversation: ConversationRecord,
): boolean {
  if (isDiscardedEmailComposeConversation(conversation.metadata)) return false;
  if (!isNewEmailComposeConversation(conversation.metadata)) return false;
  if (conversation.customer_id) return false;
  if (conversation.last_message_at || conversation.last_message_preview?.trim()) return false;
  const fields = readEmailListDraftFields(conversation.metadata);
  return !fields.hasContentfulDraft;
}

export function findReusableEmptyNewEmailComposeShell(
  conversations: ConversationRecord[],
): ConversationRecord | null {
  const shells = conversations
    .filter(isReusableEmptyNewEmailComposeShell)
    .sort((a, b) => {
      // Shell reuse only: prefer the most recently touched empty compose shell.
      // updated_at is appropriate here (not for Inbox/Sent/Pending mail activity).
      const aAt =
        emailWorkspaceListActivityAt({
          draftUpdatedAt: readEmailListDraftFields(a.metadata).updatedAt,
          createdAt: a.updated_at || a.created_at,
        }) ?? "";
      const bAt =
        emailWorkspaceListActivityAt({
          draftUpdatedAt: readEmailListDraftFields(b.metadata).updatedAt,
          createdAt: b.updated_at || b.created_at,
        }) ?? "";
      return bAt.localeCompare(aAt);
    });
  return shells[0] ?? null;
}
