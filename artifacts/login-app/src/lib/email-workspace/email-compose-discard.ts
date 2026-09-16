/**
 * Discard New Email draft helpers — pure logic for tests + UI.
 * Does not delete customers, tickets, or sent conversations.
 */
import {
  EMAIL_COMPOSE_DISCARDED_KEY,
  buildEmailComposerDraftPatch,
  parseRecipientList,
  type EmailComposerDraftAttachment,
} from "@/lib/email-workspace/email-thread-outbound";
import { EMAIL_COMPOSE_ORIGIN, EMAIL_COMPOSE_ORIGIN_KEY, isNewEmailComposeConversation } from "@/lib/email-workspace/email-compose-new";

export type DiscardEmailDraftDecision = {
  /** Clear composer draft metadata. */
  clearDraft: true;
  /** Mark conversation discarded so it leaves the active inbox list. */
  markDiscarded: boolean;
  /** Close conversation when it is an unused New Email compose shell. */
  closeConversation: boolean;
  /** Attachment storage paths safe to remove (draft-only). */
  orphanAttachmentPaths: string[];
};

export function planDiscardEmailDraft(input: {
  metadata: Record<string, unknown> | null | undefined;
  attachments: EmailComposerDraftAttachment[];
  /** True when conversation has no outbound/inbound customer-facing messages. */
  hasCustomerFacingMessages: boolean;
}): DiscardEmailDraftDecision {
  const isCompose = isNewEmailComposeConversation(input.metadata);
  const unusedComposeShell = isCompose && !input.hasCustomerFacingMessages;
  return {
    clearDraft: true,
    markDiscarded: unusedComposeShell,
    closeConversation: unusedComposeShell,
    orphanAttachmentPaths: input.attachments
      .map((item) => item.storagePath)
      .filter((path) => Boolean(path) && !path.includes("..") && !path.startsWith("/")),
  };
}

export function buildDiscardedEmailComposeMetadata(
  currentMetadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = buildEmailComposerDraftPatch(currentMetadata, null);
  next[EMAIL_COMPOSE_DISCARDED_KEY] = true;
  next[EMAIL_COMPOSE_ORIGIN_KEY] = EMAIL_COMPOSE_ORIGIN;
  next.discardedAt = new Date().toISOString();
  return next;
}

/** Composer has user content worth confirming before discard. */
export function emailDraftHasDiscardableContent(input: {
  to: string | string[];
  cc: string | string[];
  bcc: string | string[];
  subject: string;
  bodyPlain: string;
  attachmentCount: number;
}): boolean {
  return Boolean(
    parseRecipientList(input.to).length > 0 ||
      parseRecipientList(input.cc).length > 0 ||
      parseRecipientList(input.bcc).length > 0 ||
      input.subject.trim() ||
      input.bodyPlain.trim() ||
      input.attachmentCount > 0,
  );
}
