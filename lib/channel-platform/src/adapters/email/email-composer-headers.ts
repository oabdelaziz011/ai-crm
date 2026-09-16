import { buildForwardSubject, buildReplySubject, normalizeEmailMessageId } from "./email-html-utils.js";

export type EmailComposerMode = "reply" | "reply_all" | "forward" | "compose";

export type EmailParticipantAddress = {
  email: string;
  name?: string;
};

export type EmailThreadParticipantSnapshot = {
  /** Primary customer/external From address for the thread. */
  from?: EmailParticipantAddress | null;
  /** Original To recipients (company + others). */
  to?: EmailParticipantAddress[];
  /** Original CC recipients. */
  cc?: EmailParticipantAddress[];
  /** Last inbound external Message-ID (for In-Reply-To). */
  lastInboundMessageId?: string | null;
  /** Accumulated References chain. */
  references?: string[];
  /** Thread root Message-ID / external_thread_id. */
  threadRootMessageId?: string | null;
  /** Latest subject (without Re:/Fwd: normalization for display). */
  subject?: string | null;
  /** Company mailbox addresses that must never appear as To/Cc of a reply. */
  companyMailboxes?: string[];
};

function normalizeAddress(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmailAddress(value: string): boolean {
  const email = normalizeAddress(value);
  if (!email || email.length > 320) return false;
  const at = email.indexOf("@");
  return at > 0 && at < email.length - 1 && !email.includes(" ");
}

function dedupeEmails(
  addresses: Array<string | null | undefined>,
  exclude: Set<string>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const email = normalizeAddress(raw);
    if (!isValidEmailAddress(email)) continue;
    if (exclude.has(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function collectCompanyExclusions(
  companyMailboxes: string[] | undefined,
  agentMailbox?: string | null,
): Set<string> {
  const exclude = new Set<string>();
  for (const mailbox of companyMailboxes ?? []) {
    const normalized = normalizeAddress(mailbox);
    if (isValidEmailAddress(normalized)) exclude.add(normalized);
  }
  const agent = normalizeAddress(agentMailbox);
  if (isValidEmailAddress(agent)) exclude.add(agent);
  return exclude;
}

/**
 * Build Reply participants: To = original From (customer), no Cc.
 * Excludes company mailboxes and the agent identity.
 */
export function buildReplyParticipants(
  snapshot: EmailThreadParticipantSnapshot,
  options?: { agentMailbox?: string | null },
): { to: string[]; cc: string[]; bcc: string[] } {
  const exclude = collectCompanyExclusions(snapshot.companyMailboxes, options?.agentMailbox);
  const to = dedupeEmails([snapshot.from?.email], exclude);
  return { to, cc: [], bcc: [] };
}

/**
 * Reply All: To = From; Cc = original To + Cc minus From, company mailboxes, and agent.
 */
export function buildReplyAllParticipants(
  snapshot: EmailThreadParticipantSnapshot,
  options?: { agentMailbox?: string | null },
): { to: string[]; cc: string[]; bcc: string[] } {
  const companyExclude = collectCompanyExclusions(
    snapshot.companyMailboxes,
    options?.agentMailbox,
  );
  const fromEmail = normalizeAddress(snapshot.from?.email);
  const to =
    isValidEmailAddress(fromEmail) && !companyExclude.has(fromEmail) ? [fromEmail] : [];

  const ccExclude = new Set(companyExclude);
  if (isValidEmailAddress(fromEmail)) ccExclude.add(fromEmail);
  const ccSources = [
    ...(snapshot.to ?? []).map((item) => item.email),
    ...(snapshot.cc ?? []).map((item) => item.email),
  ];
  const cc = dedupeEmails(ccSources, ccExclude);

  return { to, cc, bcc: [] };
}

/**
 * Forward: empty recipients (caller fills To/Cc/Bcc). Subject uses Fwd: prefix.
 * Body context is built separately — never includes internal routing/AI notes.
 */
export function buildForwardSubjectLine(subject: string | null | undefined): string {
  return buildForwardSubject(typeof subject === "string" ? subject : "");
}

export function buildForwardQuotedBody(input: {
  from?: EmailParticipantAddress | null;
  to?: EmailParticipantAddress[];
  subject?: string | null;
  date?: string | null;
  body: string;
}): string {
  const fromLine = input.from?.email
    ? input.from.name
      ? `${input.from.name} <${input.from.email}>`
      : input.from.email
    : "(unknown)";
  const toLine =
    (input.to ?? [])
      .map((item) => (item.name ? `${item.name} <${item.email}>` : item.email))
      .join(", ") || "(unknown)";
  const subject = (input.subject ?? "").trim() || "(no subject)";
  const date = (input.date ?? "").trim() || "";
  const body = input.body.trim();

  return [
    "",
    "---------- Forwarded message ----------",
    `From: ${fromLine}`,
    date ? `Date: ${date}` : null,
    `Subject: ${subject}`,
    `To: ${toLine}`,
    "",
    body,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export type BuiltEmailComposerOutbound = {
  /** Primary recipient (first To) — used for customer linking / legacy adapters. */
  recipientEmail: string;
  /** Full To list for SMTP (multi-recipient compose). */
  to: string[];
  cc: string[];
  bcc: string[];
  emailSubject: string;
  inReplyTo?: string;
  emailReferences?: string[];
  threadRootMessageId?: string;
  mode: EmailComposerMode;
};

/**
 * Build outbound metadata for Reply / Reply All / Forward using existing
 * EmailCloudAdapter + SMTP fields (recipientEmail, cc, bcc, threading headers).
 */
export function buildEmailComposerOutbound(input: {
  mode: EmailComposerMode;
  snapshot: EmailThreadParticipantSnapshot;
  /** Explicit To override (compose / forward / edited reply). */
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string | null;
  agentMailbox?: string | null;
}): BuiltEmailComposerOutbound {
  const mode = input.mode;
  let to: string[] = [];
  let cc: string[] = [];
  let bcc: string[] = [];

  if (mode === "reply") {
    const participants = buildReplyParticipants(input.snapshot, {
      agentMailbox: input.agentMailbox,
    });
    to = input.to?.length ? dedupeEmails(input.to, new Set()) : participants.to;
    cc = input.cc?.length ? dedupeEmails(input.cc, new Set(to)) : [];
    bcc = input.bcc?.length ? dedupeEmails(input.bcc, new Set([...to, ...cc])) : [];
  } else if (mode === "reply_all") {
    const participants = buildReplyAllParticipants(input.snapshot, {
      agentMailbox: input.agentMailbox,
    });
    to = input.to?.length ? dedupeEmails(input.to, new Set()) : participants.to;
    cc = input.cc?.length
      ? dedupeEmails(input.cc, new Set(to))
      : dedupeEmails(participants.cc, new Set(to));
    bcc = input.bcc?.length ? dedupeEmails(input.bcc, new Set([...to, ...cc])) : [];
  } else {
    // forward | compose — recipients must be provided by the caller
    to = dedupeEmails(input.to ?? [], new Set());
    cc = dedupeEmails(input.cc ?? [], new Set(to));
    bcc = dedupeEmails(input.bcc ?? [], new Set([...to, ...cc]));
  }

  const recipientEmail = to[0] ?? "";

  const baseSubject =
    typeof input.subject === "string" && input.subject.trim()
      ? input.subject.trim()
      : typeof input.snapshot.subject === "string"
        ? input.snapshot.subject
        : "";

  const emailSubject =
    mode === "forward"
      ? buildForwardSubjectLine(baseSubject)
      : mode === "compose"
        ? baseSubject || "(no subject)"
        : buildReplySubject(baseSubject);

  const inReplyTo =
    mode === "forward" || mode === "compose"
      ? undefined
      : input.snapshot.lastInboundMessageId
        ? normalizeEmailMessageId(input.snapshot.lastInboundMessageId) || undefined
        : undefined;

  const emailReferences =
    mode === "forward" || mode === "compose"
      ? undefined
      : (input.snapshot.references ?? [])
          .map((item) => normalizeEmailMessageId(item))
          .filter(Boolean);

  const threadRootMessageId =
    mode === "forward" || mode === "compose"
      ? undefined
      : input.snapshot.threadRootMessageId
        ? normalizeEmailMessageId(input.snapshot.threadRootMessageId) || undefined
        : undefined;

  return {
    recipientEmail,
    to,
    cc: mode === "reply" ? [] : cc,
    bcc,
    emailSubject,
    inReplyTo,
    emailReferences: emailReferences?.length ? emailReferences : undefined,
    threadRootMessageId,
    mode,
  };
}

/** Convert BuiltEmailComposerOutbound into EmailCloudAdapter metadata. */
export function toEmailOutboundDispatchMetadata(
  built: BuiltEmailComposerOutbound,
): Record<string, unknown> {
  return {
    recipientEmail: built.recipientEmail || undefined,
    /** All To recipients — EmailCloudAdapter prefers this over a single recipientEmail. */
    recipientEmails: built.to.length ? built.to : undefined,
    inReplyTo: built.inReplyTo,
    // Already Re:/Fwd: prefixed — EmailCloudAdapter uses emailSubject as-is.
    emailSubject: built.emailSubject,
    emailReferences: built.emailReferences,
    threadRootMessageId: built.threadRootMessageId,
    cc: built.cc.length ? built.cc : undefined,
    bcc: built.bcc.length ? built.bcc : undefined,
    emailComposerMode: built.mode,
  };
}
