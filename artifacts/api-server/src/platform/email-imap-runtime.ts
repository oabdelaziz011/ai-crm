import type { EmailChannelConfiguration, EmailImapRuntimeMessage } from "@workspace/channel-platform";
import { normalizeEmailMessageId } from "@workspace/channel-platform";

/** Max full-source MIME fetches per poll tick. Unbounded `start:*` with source kills IMAP on large mailboxes. */
const IMAP_POLL_SOURCE_BATCH_SIZE = 20;

/** Lightweight IMAP login probe for staged connection tests (does not fetch mail). */
export async function probeImapConnection(config: EmailChannelConfiguration): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!config.imapHost?.trim()) {
    return { ok: false, error: "imap_host_missing" };
  }
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort ?? 993,
    secure: config.imapEncryption === "ssl" || (config.imapPort ?? 993) === 993,
    auth: {
      user: config.imapUsername ?? config.smtpUsername,
      pass: config.imapPassword ?? config.smtpPassword,
    },
    logger: false,
  });
  try {
    await client.connect();
    const mailbox = config.imapMailbox ?? "INBOX";
    await client.mailboxOpen(mailbox);
    await client.logout();
    return { ok: true };
  } catch (error) {
    try {
      await client.logout();
    } catch {
      // ignore logout errors after failed connect
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 120) : "imap_connect_failed",
    };
  }
}

export async function fetchImapRuntimeMessages(input: {
  config: EmailChannelConfiguration;
  lastUid: number;
  mailbox?: string;
}): Promise<EmailImapRuntimeMessage[]> {
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const client = new ImapFlow({
    host: input.config.imapHost!,
    port: input.config.imapPort ?? 993,
    secure: input.config.imapEncryption === "ssl" || (input.config.imapPort ?? 993) === 993,
    auth: {
      user: input.config.imapUsername ?? input.config.smtpUsername,
      pass: input.config.imapPassword ?? input.config.smtpPassword,
    },
    logger: false,
  });

  const mailbox = input.mailbox ?? input.config.imapMailbox ?? "INBOX";
  const messages: EmailImapRuntimeMessage[] = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const startUid = Math.max(1, input.lastUid + 1);
      const uidNext = client.mailbox?.uidNext;
      if (typeof uidNext === "number" && startUid >= uidNext) {
        return messages;
      }
      const endUid =
        typeof uidNext === "number"
          ? Math.min(startUid + IMAP_POLL_SOURCE_BATCH_SIZE - 1, uidNext - 1)
          : startUid + IMAP_POLL_SOURCE_BATCH_SIZE - 1;
      if (endUid < startUid) {
        return messages;
      }

      // Third-arg `{ uid: true }` is required: otherwise the range is SEQUENCE numbers.
      // `imap_last_uid` stores IMAP UIDs (often >> exists), so sequence mode silently returns nothing.
      for await (const message of client.fetch(
        `${startUid}:${endUid}`,
        {
          uid: true,
          source: true,
          envelope: true,
        },
        { uid: true },
      )) {
        if (!message.source || message.uid == null) continue;

        const parsed = await simpleParser(message.source);
        const messageId = normalizeEmailMessageId(parsed.messageId ?? `uid-${message.uid}@imap.local`);
        const fromAddress = parsed.from?.value?.[0];
        const referencesRaw = parsed.references;
        const referencesList = Array.isArray(referencesRaw)
          ? referencesRaw
          : typeof referencesRaw === "string" && referencesRaw.trim()
            ? [referencesRaw]
            : [];
        const toAddresses = Array.isArray(parsed.to)
          ? parsed.to.flatMap((entry) => entry.value ?? [])
          : (parsed.to?.value ?? []);

        messages.push({
          uid: message.uid,
          messageId,
          inReplyTo: parsed.inReplyTo ? normalizeEmailMessageId(parsed.inReplyTo) : null,
          references: referencesList
            .map((item) => normalizeEmailMessageId(String(item)))
            .filter(Boolean),
          from: {
            email: (fromAddress?.address ?? "unknown@local").toLowerCase(),
            name: fromAddress?.name,
          },
          to: toAddresses.map((address) => ({
            email: (address.address ?? "").toLowerCase(),
            name: address.name,
          })),
          subject: parsed.subject ?? "",
          text: parsed.text ?? undefined,
          html: typeof parsed.html === "string" ? parsed.html : undefined,
          attachments: (parsed.attachments ?? []).map((attachment, index) => ({
            filename: attachment.filename ?? `attachment-${index + 1}`,
            mimeType: attachment.contentType ?? "application/octet-stream",
            sizeBytes: attachment.size ?? attachment.content?.length ?? 0,
            content: attachment.content,
            isInline: String(attachment.contentDisposition ?? "").toLowerCase() === "inline",
            contentId: attachment.cid || undefined,
            related: attachment.related === true,
          })),
          authenticationResultsHeader:
            typeof parsed.headers.get("authentication-results") === "string"
              ? String(parsed.headers.get("authentication-results"))
              : undefined,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return messages;
}
