import { normalizeEmailMessageId } from "./email-html-utils.js";

/** Normalize mailbox addresses for comparison (lowercase, trim, strip display wrappers). */
export function normalizeEmailAddress(email: string | null | undefined): string {
  if (!email) return "";
  const trimmed = String(email).trim().toLowerCase();
  const angle = trimmed.match(/<([^>]+)>/);
  return (angle?.[1] ?? trimmed).trim();
}

export type EmailInboundAutoReplyGuardInput = {
  /** Sender of the inbound candidate. */
  fromEmail: string | null | undefined;
  /** Company mailbox / from_email used for outbound. */
  companyFromEmail: string | null | undefined;
  /**
   * True when this Message-ID already exists as an outgoing conversation_message
   * for the company (own SMTP/Graph send echoed back into IMAP).
   */
  alreadyExistsAsOutgoing: boolean;
  /**
   * True when this Message-ID already exists as an incoming conversation_message
   * for the company (shared mailbox / dual channels / IMAP re-APPEND).
   */
  alreadyExistsAsIncoming?: boolean;
};

export type EmailInboundAutoReplyGuardDecision = {
  /** Skip persisting this inbound entirely (own outbound echo). */
  skipPersist: boolean;
  /** Force executeAi=false even if caller requested AI. */
  forceDisableAi: boolean;
  reason: string;
};

/**
 * Guards email inbound against accidental AI auto-reply loops.
 *
 * Primary loop observed in production:
 * customer/self mail → AI SMTP send → same Message-ID reappears in IMAP INBOX
 * → second AI execution.
 *
 * Also skips company-scoped duplicate inbound Message-IDs so a second channel
 * (or re-APPEND of the same provider id) cannot create a second conversation.
 */
export function evaluateEmailInboundAutoReplyGuard(
  input: EmailInboundAutoReplyGuardInput,
): EmailInboundAutoReplyGuardDecision {
  if (input.alreadyExistsAsOutgoing) {
    return {
      skipPersist: true,
      forceDisableAi: true,
      reason: "own_outbound_message_id_echo",
    };
  }

  if (input.alreadyExistsAsIncoming) {
    return {
      skipPersist: true,
      forceDisableAi: true,
      reason: "duplicate_inbound_message_id",
    };
  }

  const from = normalizeEmailAddress(input.fromEmail);
  const company = normalizeEmailAddress(input.companyFromEmail);
  if (from && company && from === company) {
    return {
      skipPersist: false,
      forceDisableAi: true,
      reason: "from_matches_company_mailbox",
    };
  }

  return {
    skipPersist: false,
    forceDisableAi: false,
    reason: "allow",
  };
}

export function normalizeInboundExternalMessageId(messageId: string | null | undefined): string {
  return normalizeEmailMessageId(messageId);
}
