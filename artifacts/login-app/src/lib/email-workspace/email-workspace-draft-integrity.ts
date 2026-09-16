/**
 * Email Workspace draft / empty-shell integrity helpers.
 * Display and cleanup only — does not invent outbound delivery status.
 */
import {
  buildDiscardedEmailComposeMetadata,
  emailDraftHasDiscardableContent,
  planDiscardEmailDraft,
} from "@/lib/email-workspace/email-compose-discard";
import {
  EMAIL_COMPOSE_ORIGIN,
  isNewEmailComposeConversation,
} from "@/lib/email-workspace/email-compose-new";
import { htmlToPlainText } from "@/lib/email-workspace/email-composer-rich-text";
import {
  buildEmailComposerDraftPatch,
  isDiscardedEmailComposeConversation,
  readEmailComposerDraft,
  type EmailComposerDraftState,
} from "@/lib/email-workspace/email-thread-outbound";

export type EmailComposeCleanupClass = "safe_empty_shell" | "legitimate" | "ambiguous";

export type EmailComposeCleanupFacts = {
  companyId: string;
  conversationCompanyId: string;
  metadata: Record<string, unknown> | null | undefined;
  customerId?: string | null;
  ticketRelated?: boolean;
  inboundMessageCount: number;
  outboundMessageCount: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
};

function draftBodyPlain(draft: EmailComposerDraftState): string {
  return (
    (draft.bodyHtml?.trim() ? htmlToPlainText(draft.bodyHtml) : "") || draft.body || ""
  );
}

/**
 * Meaningful draft content for list bucket / status.
 * Reply/reply-all UI prefills (to + Re: subject, empty body) are NOT drafts —
 * treating them as contentful would move Inbox → Pending on open/autosave.
 * Compose/forward still use the full discardable-content rule.
 */
function draftHasMeaningfulContent(draft: EmailComposerDraftState | null): boolean {
  if (!draft) return false;
  const bodyPlain = draftBodyPlain(draft);
  const attachmentCount = draft.attachments?.length ?? 0;

  if (draft.mode === "reply" || draft.mode === "reply_all") {
    return Boolean(bodyPlain.trim() || attachmentCount > 0);
  }

  return emailDraftHasDiscardableContent({
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    bodyPlain,
    attachmentCount,
  });
}

/**
 * Pure reply/reply-all composer defaults after opening a thread (to + subject, no body).
 * Must not be persisted — persistence reclassifies Inbox → Pending and reorders the list.
 */
export function isEphemeralEmailReplyComposerPrefill(input: {
  mode: string;
  bodyPlain: string;
  attachmentCount: number;
}): boolean {
  if (input.mode !== "reply" && input.mode !== "reply_all") return false;
  if (input.attachmentCount > 0) return false;
  return !input.bodyPlain.trim();
}

/**
 * Classify a conversation for abandoned-shell cleanup.
 * Only `safe_empty_shell` may be auto-cleaned.
 */
export function classifyEmailComposeConversationForCleanup(
  facts: EmailComposeCleanupFacts,
): EmailComposeCleanupClass {
  if (!facts.conversationCompanyId || facts.conversationCompanyId !== facts.companyId) {
    return "ambiguous";
  }
  if (isDiscardedEmailComposeConversation(facts.metadata)) {
    // Already cleaned — treat as safe/idempotent no-op target, not legitimate business mail.
    return "safe_empty_shell";
  }
  if (!isNewEmailComposeConversation(facts.metadata)) {
    return facts.inboundMessageCount > 0 || facts.outboundMessageCount > 0
      ? "legitimate"
      : "ambiguous";
  }

  const draft = readEmailComposerDraft(facts.metadata);
  const meaningful = draftHasMeaningfulContent(draft);
  const hasMessages = facts.inboundMessageCount > 0 || facts.outboundMessageCount > 0;
  const hasCustomer = Boolean(facts.customerId);
  const hasTicket = Boolean(facts.ticketRelated);
  const hasPreview = Boolean(facts.lastMessageAt || facts.lastMessagePreview?.trim());

  if (hasMessages || hasCustomer || hasTicket || meaningful || hasPreview) {
    return "legitimate";
  }
  if (isNewEmailComposeConversation(facts.metadata)) {
    return "safe_empty_shell";
  }
  return "ambiguous";
}

/** Abandoned empty New Email shell → same soft discard metadata as UI Discard. */
export function buildSafeEmptyComposeShellCleanupMetadata(
  currentMetadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const plan = planDiscardEmailDraft({
    metadata: currentMetadata,
    attachments: readEmailComposerDraft(currentMetadata)?.attachments ?? [],
    hasCustomerFacingMessages: false,
  });
  if (!plan.markDiscarded) {
    // Ambiguous / not a compose shell — clear draft only, never invent discard.
    return buildEmailComposerDraftPatch(currentMetadata, null);
  }
  return buildDiscardedEmailComposeMetadata(currentMetadata);
}

/**
 * Stale compose draft after a successful New Email send:
 * compose-mode draft still present while outbound messages already exist.
 * Reply drafts (mode !== compose) are preserved.
 */
export function isStaleComposeDraftAfterSuccessfulSend(input: {
  metadata: Record<string, unknown> | null | undefined;
  outboundMessageCount: number;
  latestOutboundStatus?: string | null;
}): boolean {
  if (isDiscardedEmailComposeConversation(input.metadata)) return false;
  if (!isNewEmailComposeConversation(input.metadata)) return false;
  if (input.outboundMessageCount <= 0) return false;
  const status = input.latestOutboundStatus;
  if (status && status !== "sent" && status !== "delivered" && status !== "read") {
    // Failed/pending outbound — keep draft editable.
    if (status === "failed" || status === "pending" || status === "sending") return false;
  }
  const draft = readEmailComposerDraft(input.metadata);
  if (!draft || draft.mode !== "compose") return false;
  // Any remaining compose-mode draft after a successful outbound is stale for New Email.
  return true;
}

/** Clear only draft metadata; preserve conversation + messages. */
export function buildClearStaleComposeDraftMetadata(
  currentMetadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = buildEmailComposerDraftPatch(currentMetadata, null);
  // Keep compose origin for history, but record that draft was cleared after send.
  if (isNewEmailComposeConversation(currentMetadata)) {
    next.emailComposeOrigin = EMAIL_COMPOSE_ORIGIN;
    next.emailDraftClearedAfterSendAt = new Date().toISOString();
  }
  return next;
}

/**
 * Active draft for list/status: contentful and not a stale post-send compose shell.
 */
export function hasActiveEmailWorkspaceDraft(input: {
  metadata: Record<string, unknown> | null | undefined;
  /** When true, conversation already has successful outbound (from list cache or messages). */
  hasSuccessfulOutbound?: boolean;
  outboundMessageCount?: number;
  latestOutboundStatus?: string | null;
}): boolean {
  const draft = readEmailComposerDraft(input.metadata);
  if (!draftHasMeaningfulContent(draft)) return false;

  const outboundCount = input.outboundMessageCount ?? (input.hasSuccessfulOutbound ? 1 : 0);
  if (
    isStaleComposeDraftAfterSuccessfulSend({
      metadata: input.metadata,
      outboundMessageCount: outboundCount,
      latestOutboundStatus: input.latestOutboundStatus ?? (input.hasSuccessfulOutbound ? "sent" : null),
    })
  ) {
    return false;
  }
  return true;
}

/**
 * Guard against autosave finishing after Send and rewriting draft metadata.
 * Pure decision for tests + UI.
 */
export function shouldPersistEmailComposerDraft(input: {
  conversationId: string;
  suppressDraftPersistForConversationId: string | null;
  sendGeneration: number;
  scheduledGeneration: number;
  isSending: boolean;
  sendStatus: "idle" | "sending" | "success" | "error";
  /** When set, blocks persisting unedited reply/reply-all open prefills. */
  composerMode?: string;
  bodyPlain?: string;
  attachmentCount?: number;
}): boolean {
  if (input.isSending || input.sendStatus === "sending") return false;
  if (input.sendStatus === "success") return false;
  if (
    input.suppressDraftPersistForConversationId &&
    input.suppressDraftPersistForConversationId === input.conversationId
  ) {
    return false;
  }
  if (input.scheduledGeneration !== input.sendGeneration) return false;
  if (
    input.composerMode != null &&
    isEphemeralEmailReplyComposerPrefill({
      mode: input.composerMode,
      bodyPlain: input.bodyPlain ?? "",
      attachmentCount: input.attachmentCount ?? 0,
    })
  ) {
    return false;
  }
  return true;
}

/**
 * Stable fingerprint so mark-read list refetch / selected identity churn
 * does not look like a composer edit and must not trigger draft autosave.
 */
export function emailComposerDraftAutosaveFingerprint(input: {
  mode: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyPlain: string;
  attachmentIds: string[];
}): string {
  return JSON.stringify({
    mode: input.mode,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject.trim(),
    bodyPlain: input.bodyPlain.trim(),
    attachmentIds: [...input.attachmentIds].sort(),
  });
}

function fingerprintEmailComposerDraftState(draft: EmailComposerDraftState): string {
  return emailComposerDraftAutosaveFingerprint({
    mode: draft.mode,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    bodyPlain: draftBodyPlain(draft).trim(),
    attachmentIds: (draft.attachments ?? []).map((item) => item.id),
  });
}

/**
 * Opening / hydrate / sanitize must not bump draft.updatedAt — that timestamp
 * orders Pending compose shells. Preserve the stored value when content is unchanged.
 */
export function resolveEmailComposerDraftUpdatedAtForPersist(input: {
  previousDraft: EmailComposerDraftState | null;
  nextDraft: Pick<
    EmailComposerDraftState,
    "mode" | "to" | "cc" | "bcc" | "subject" | "body" | "bodyHtml" | "attachments"
  >;
  nowIso: string;
}): string {
  const previous = input.previousDraft;
  if (!previous?.updatedAt?.trim()) return input.nowIso;
  const nextAsDraft: EmailComposerDraftState = {
    ...previous,
    ...input.nextDraft,
    updatedAt: previous.updatedAt,
  };
  if (fingerprintEmailComposerDraftState(previous) === fingerprintEmailComposerDraftState(nextAsDraft)) {
    return previous.updatedAt;
  }
  return input.nowIso;
}

/**
 * Skip metadata write entirely when open/hydrate produced an identical draft.
 * Avoids conversations.updated_at trigger noise that is unrelated to list order.
 */
export function isUnchangedEmailComposerDraftPersist(input: {
  previousDraft: EmailComposerDraftState | null;
  nextDraft: Pick<
    EmailComposerDraftState,
    "mode" | "to" | "cc" | "bcc" | "subject" | "body" | "bodyHtml" | "attachments"
  >;
}): boolean {
  const previous = input.previousDraft;
  if (!previous) return false;
  const nextAsDraft: EmailComposerDraftState = {
    ...previous,
    ...input.nextDraft,
    updatedAt: previous.updatedAt,
  };
  return fingerprintEmailComposerDraftState(previous) === fingerprintEmailComposerDraftState(nextAsDraft);
}
