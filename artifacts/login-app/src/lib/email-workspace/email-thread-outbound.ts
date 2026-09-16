import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import {
  buildEmailComposerOutbound,
  buildForwardQuotedBody,
  toEmailOutboundDispatchMetadata,
  type EmailComposerMode,
  type EmailParticipantAddress,
  type EmailThreadParticipantSnapshot,
} from "@workspace/channel-platform";

function asAddress(value: unknown): EmailParticipantAddress | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const email =
    typeof record.email === "string"
      ? record.email.trim()
      : typeof record.address === "string"
        ? record.address.trim()
        : "";
  if (!email || !email.includes("@")) return null;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : undefined;
  return { email, name };
}

function asAddressList(value: unknown): EmailParticipantAddress[] {
  if (!Array.isArray(value)) return [];
  return value.map(asAddress).filter((item): item is EmailParticipantAddress => Boolean(item));
}

function messageAddresses(message: ConversationMessageRecord): {
  from: EmailParticipantAddress | null;
  to: EmailParticipantAddress[];
  cc: EmailParticipantAddress[];
  subject: string | null;
  references: string[];
} {
  const meta = message.metadata ?? {};
  const from =
    asAddress(meta.from) ??
    (typeof meta.senderExternalId === "string" && meta.senderExternalId.includes("@")
      ? { email: meta.senderExternalId.trim() }
      : null);
  return {
    from,
    to: asAddressList(meta.to),
    cc: asAddressList(meta.cc),
    subject: typeof meta.subject === "string" ? meta.subject : null,
    references: Array.isArray(meta.references) ? meta.references.map(String) : [],
  };
}

/**
 * Build a participant/threading snapshot from conversation messages.
 * Prefer the latest inbound (customer) message for Reply semantics.
 */
export function buildEmailThreadParticipantSnapshot(input: {
  messages: ConversationMessageRecord[];
  externalThreadId?: string | null;
  companyMailboxes?: string[];
  conversationSubject?: string | null;
}): EmailThreadParticipantSnapshot {
  const chronological = [...input.messages].sort(
    (a, b) => a.sequence_number - b.sequence_number || a.created_at.localeCompare(b.created_at),
  );
  const inbound = [...chronological].reverse().find((m) => m.message_type === "incoming");
  const seed = inbound ?? chronological.at(-1) ?? null;
  const seedAddresses = seed ? messageAddresses(seed) : {
    from: null,
    to: [] as EmailParticipantAddress[],
    cc: [] as EmailParticipantAddress[],
    subject: null,
    references: [] as string[],
  };

  const references = new Set<string>();
  for (const message of chronological) {
    for (const ref of messageAddresses(message).references) {
      if (ref.trim()) references.add(ref.trim());
    }
    if (message.external_message_id?.trim()) {
      references.add(message.external_message_id.trim());
    }
  }

  return {
    from: seedAddresses.from,
    to: seedAddresses.to,
    cc: seedAddresses.cc,
    lastInboundMessageId: inbound?.external_message_id ?? null,
    references: [...references],
    threadRootMessageId: input.externalThreadId ?? null,
    subject: seedAddresses.subject ?? input.conversationSubject ?? null,
    companyMailboxes: input.companyMailboxes ?? [],
  };
}

export function buildEmailWorkspaceOutboundMetadata(input: {
  mode: EmailComposerMode;
  messages: ConversationMessageRecord[];
  externalThreadId?: string | null;
  companyMailboxes?: string[];
  conversationSubject?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string | null;
  agentMailbox?: string | null;
}): Record<string, unknown> {
  const snapshot = buildEmailThreadParticipantSnapshot({
    messages: input.messages,
    externalThreadId: input.externalThreadId,
    companyMailboxes: input.companyMailboxes,
    conversationSubject: input.conversationSubject,
  });
  const built = buildEmailComposerOutbound({
    mode: input.mode,
    snapshot,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    agentMailbox: input.agentMailbox,
  });
  return toEmailOutboundDispatchMetadata(built);
}

/** Safe forward body — excludes internal notes, routing, AI reasoning. */
export function buildSafeForwardDraftFromMessage(
  message: ConversationMessageRecord,
): { subject: string; body: string } {
  const addresses = messageAddresses(message);
  const body = buildForwardQuotedBody({
    from: addresses.from,
    to: addresses.to,
    subject: addresses.subject,
    date: message.created_at,
    body: message.content,
  });
  const subject = addresses.subject ?? "";
  return { subject, body };
}

export const EMAIL_COMPOSER_DRAFT_METADATA_KEY = "emailComposerDraft" as const;

export type EmailComposerDraftAttachment = {
  id: string;
  name: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  kind: "image" | "pdf" | "docx" | "xlsx" | "txt" | "file";
};

export type EmailComposerDraftState = {
  mode: EmailComposerMode;
  /** Primary To recipients (array is canonical; legacy drafts may have been strings). */
  to: string[];
  /** Cc recipients — same multi-recipient model as To. */
  cc: string[];
  /** Bcc recipients — same multi-recipient model as To. */
  bcc: string[];
  subject: string;
  /** Editable body plain text (MIME text/plain source / legacy). */
  body: string;
  /** Editable body HTML (rich composer). Signature is NOT embedded here. */
  bodyHtml?: string;
  /** Company Email channel id selected as From (server remains authoritative on send). */
  selectedChannelId?: string | null;
  /** Explicit CRM customer link for this draft (company-scoped). */
  customerId?: string | null;
  /** Explicit ticket link for this draft (company/customer-scoped). */
  ticketId?: string | null;
  /** Unresolved template tokens last detected after insert (informational). */
  templateUnresolved?: string[];
  updatedAt: string;
  attachments: EmailComposerDraftAttachment[];
};

/**
 * Soft per-field recipient cap (application-level).
 * Protects against pathological paste/input; not a claim of unlimited SMTP capacity.
 * Outbound still depends on provider/SMTP envelope limits.
 */
export const EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD = 100;

/** Normalize + dedupe (case-insensitive) while preserving first-seen casing. */
export function normalizeRecipientEmails(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Parse recipient tokens from a string, string[], or legacy draft value.
 * Separators: comma, semicolon, whitespace, newlines.
 */
export function parseRecipientList(
  value: string | readonly string[] | null | undefined,
): string[] {
  if (Array.isArray(value)) {
    return normalizeRecipientEmails(
      value.flatMap((item) => parseRecipientList(typeof item === "string" ? item : String(item ?? ""))),
    );
  }
  const raw = String(value ?? "");
  if (!raw.trim()) return [];
  return normalizeRecipientEmails(
    raw
      .split(/[,;\s\n\r]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

/** Read draft to/cc/bcc supporting legacy comma-separated strings and new string[]. */
export function readDraftRecipientField(raw: unknown): string[] {
  if (Array.isArray(raw)) return parseRecipientList(raw.map((item) => String(item ?? "")));
  if (typeof raw === "string") return parseRecipientList(raw);
  return [];
}

export function mergeRecipientEmails(
  existing: readonly string[],
  incoming: readonly string[],
  max: number = EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD,
): { list: string[]; truncated: boolean } {
  const list = normalizeRecipientEmails([...existing, ...incoming]);
  if (list.length <= max) return { list, truncated: false };
  return { list: list.slice(0, Math.max(0, max)), truncated: true };
}

export function recipientFieldHasContent(list: readonly string[] | string | null | undefined): boolean {
  return parseRecipientList(list).length > 0;
}

export function serializeRecipientListForDisplay(list: readonly string[]): string {
  return normalizeRecipientEmails(list).join(", ");
}

const DRAFT_ATTACHMENT_KINDS = new Set<EmailComposerDraftAttachment["kind"]>([
  "image",
  "pdf",
  "docx",
  "xlsx",
  "txt",
  "file",
]);

export function parseEmailComposerDraftAttachments(raw: unknown): EmailComposerDraftAttachment[] {
  if (!Array.isArray(raw)) return [];
  const results: EmailComposerDraftAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const storagePath = typeof record.storagePath === "string" ? record.storagePath.trim() : "";
    const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim() : "";
    const fileSize = typeof record.fileSize === "number" && Number.isFinite(record.fileSize) ? record.fileSize : 0;
    const kind = DRAFT_ATTACHMENT_KINDS.has(record.kind as EmailComposerDraftAttachment["kind"])
      ? (record.kind as EmailComposerDraftAttachment["kind"])
      : "file";
    if (!id || !name || !storagePath || storagePath.includes("..") || storagePath.startsWith("/")) continue;
    results.push({
      id,
      name,
      storagePath,
      mimeType: mimeType || "application/octet-stream",
      fileSize,
      kind,
    });
  }
  return results;
}

export type EmailMessageAttachmentView = {
  id: string | null;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  storagePath: string | null;
  url: string | null;
};

/** Timeline display: prefer metadata.attachments[], fall back to legacy attachment_url. */
export function readConversationMessageAttachments(
  message: ConversationMessageRecord,
): EmailMessageAttachmentView[] {
  const raw = message.metadata?.attachments;
  if (Array.isArray(raw) && raw.length > 0) {
    const results: EmailMessageAttachmentView[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const nested =
        record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? (record.metadata as Record<string, unknown>)
          : {};
      const name =
        (typeof record.name === "string" && record.name.trim()) ||
        (typeof record.filename === "string" && record.filename.trim()) ||
        (typeof nested.name === "string" && nested.name.trim()) ||
        "";
      const storagePathRaw =
        (typeof record.storagePath === "string" && record.storagePath.trim()) ||
        (typeof nested.storagePath === "string" && nested.storagePath.trim()) ||
        "";
      const storagePath = storagePathRaw && !storagePathRaw.includes("..") ? storagePathRaw : null;
      const url = typeof record.url === "string" && record.url.trim() ? record.url.trim() : null;
      const fileSize =
        typeof record.fileSize === "number" && Number.isFinite(record.fileSize)
          ? record.fileSize
          : typeof nested.fileSize === "number" && Number.isFinite(nested.fileSize)
            ? nested.fileSize
            : typeof nested.sizeBytes === "number" && Number.isFinite(nested.sizeBytes)
              ? nested.sizeBytes
              : null;
      if (!name && !storagePath && !url) continue;
      results.push({
        id:
          typeof record.id === "string"
            ? record.id
            : typeof record.attachmentId === "string"
              ? record.attachmentId
              : typeof nested.id === "string"
                ? nested.id
                : null,
        name: name || "attachment",
        mimeType:
          typeof record.mimeType === "string"
            ? record.mimeType
            : typeof nested.mimeType === "string"
              ? nested.mimeType
              : null,
        fileSize,
        storagePath,
        url,
      });
    }
    if (results.length > 0) return results;
  }

  if (!message.attachment_url && !message.attachment_type) return [];
  return [
    {
      id: null,
      name: message.attachment_type || "attachment",
      mimeType: message.mime_type,
      fileSize: message.file_size,
      storagePath: null,
      url: message.attachment_url,
    },
  ];
}

export function readEmailComposerDraft(
  metadata: Record<string, unknown> | null | undefined,
): EmailComposerDraftState | null {
  const raw = metadata?.[EMAIL_COMPOSER_DRAFT_METADATA_KEY];
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const mode =
    record.mode === "reply" ||
    record.mode === "reply_all" ||
    record.mode === "forward" ||
    record.mode === "compose"
      ? record.mode
      : "reply";
  return {
    mode,
    to: readDraftRecipientField(record.to),
    cc: readDraftRecipientField(record.cc),
    bcc: readDraftRecipientField(record.bcc),
    subject: typeof record.subject === "string" ? record.subject : "",
    body: typeof record.body === "string" ? record.body : "",
    bodyHtml: typeof record.bodyHtml === "string" ? record.bodyHtml : undefined,
    selectedChannelId:
      typeof record.selectedChannelId === "string"
        ? record.selectedChannelId
        : record.selectedChannelId === null
          ? null
          : undefined,
    customerId:
      typeof record.customerId === "string"
        ? record.customerId
        : record.customerId === null
          ? null
          : undefined,
    ticketId:
      typeof record.ticketId === "string"
        ? record.ticketId
        : record.ticketId === null
          ? null
          : undefined,
    templateUnresolved: Array.isArray(record.templateUnresolved)
      ? record.templateUnresolved.map(String).filter(Boolean)
      : undefined,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    attachments: parseEmailComposerDraftAttachments(record.attachments),
  };
}

export const EMAIL_COMPOSE_DISCARDED_KEY = "emailComposeDiscarded" as const;

export function isDiscardedEmailComposeConversation(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(metadata?.[EMAIL_COMPOSE_DISCARDED_KEY]);
}

export function buildEmailComposerDraftPatch(
  currentMetadata: Record<string, unknown> | null | undefined,
  draft: EmailComposerDraftState | null,
): Record<string, unknown> {
  const next = { ...(currentMetadata ?? {}) };
  if (!draft) {
    delete next[EMAIL_COMPOSER_DRAFT_METADATA_KEY];
    return next;
  }
  next[EMAIL_COMPOSER_DRAFT_METADATA_KEY] = {
    ...draft,
    to: normalizeRecipientEmails(draft.to),
    cc: normalizeRecipientEmails(draft.cc),
    bcc: normalizeRecipientEmails(draft.bcc),
  };
  return next;
}
