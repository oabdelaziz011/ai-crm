import type { EmailChannelConfiguration, EmailImapRuntimeMessage } from "@workspace/channel-platform";
import { normalizeEmailMessageId } from "@workspace/channel-platform";

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
      for await (const message of client.fetch(`${startUid}:*`, {
        uid: true,
        source: true,
        envelope: true,
      })) {
        if (!message.source || message.uid == null) continue;

        const parsed = await simpleParser(message.source);
        const messageId = normalizeEmailMessageId(parsed.messageId ?? `uid-${message.uid}@imap.local`);
        const fromAddress = parsed.from?.value?.[0];

        messages.push({
          uid: message.uid,
          messageId,
          inReplyTo: parsed.inReplyTo ? normalizeEmailMessageId(parsed.inReplyTo) : null,
          references: (parsed.references ?? []).map((item) => normalizeEmailMessageId(String(item))).filter(Boolean),
          from: {
            email: (fromAddress?.address ?? "unknown@local").toLowerCase(),
            name: fromAddress?.name,
          },
          to: (parsed.to?.value ?? []).map((address) => ({
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
