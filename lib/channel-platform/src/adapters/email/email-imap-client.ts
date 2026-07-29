import type { EmailChannelConfiguration } from "./email-config.js";
import type { EmailImapFetchResult, ParsedInboundEmail } from "./email-types.js";
import { EmailInboundAdapter } from "./email-inbound-adapter.js";
import { htmlToPlainText, normalizeEmailMessageId, sanitizeEmailHtml } from "./email-html-utils.js";
import { parseAuthenticationResultsHeader } from "./email-security.js";

export type EmailImapClientPort = {
  fetchNewMessages(input: {
    config: EmailChannelConfiguration;
    lastUid: number;
    mailbox?: string;
  }): Promise<EmailImapFetchResult>;
};

export type EmailImapRuntimeMessage = {
  uid: number;
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    sizeBytes: number;
    content?: Buffer;
    url?: string;
  }>;
  authenticationResultsHeader?: string;
};

export function mapRuntimeImapMessage(message: EmailImapRuntimeMessage): ParsedInboundEmail {
  const htmlOriginal = message.html;
  const htmlSanitized = htmlOriginal ? sanitizeEmailHtml(htmlOriginal) : undefined;

  return {
    uid: message.uid,
    messageId: normalizeEmailMessageId(message.messageId),
    inReplyTo: message.inReplyTo ? normalizeEmailMessageId(message.inReplyTo) : null,
    references: (message.references ?? []).map((item) => normalizeEmailMessageId(item)).filter(Boolean),
    from: message.from,
    to: message.to,
    subject: message.subject,
    textPlain: message.text?.trim() || (htmlOriginal ? htmlToPlainText(htmlOriginal) : ""),
    htmlOriginal,
    htmlSanitized,
    attachments: (message.attachments ?? []).map((attachment, index) => ({
      attachmentId: `imap-${message.uid}-${index + 1}`,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      content: attachment.content,
      url: attachment.url,
    })),
    authenticationResults: parseAuthenticationResultsHeader(message.authenticationResultsHeader),
  };
}

export class EmailImapClient implements EmailImapClientPort {
  private readonly inboundAdapter: EmailInboundAdapter;
  private readonly fetchImpl?: (input: {
    config: EmailChannelConfiguration;
    lastUid: number;
    mailbox?: string;
  }) => Promise<EmailImapRuntimeMessage[]>;

  constructor(options?: {
    inboundAdapter?: EmailInboundAdapter;
    fetchImpl?: EmailImapClient["fetchImpl"];
  }) {
    this.inboundAdapter = options?.inboundAdapter ?? new EmailInboundAdapter();
    this.fetchImpl = options?.fetchImpl;
  }

  async fetchNewMessages(input: {
    config: EmailChannelConfiguration;
    lastUid: number;
    mailbox?: string;
  }): Promise<EmailImapFetchResult> {
    if (!this.fetchImpl) {
      throw new Error(
        "Email IMAP fetch implementation is not configured. Inject fetchImpl from api-server runtime.",
      );
    }

    const runtimeMessages = await this.fetchImpl({
      config: input.config,
      lastUid: input.lastUid,
      mailbox: input.mailbox,
    });

    const messages: ParsedInboundEmail[] = [];
    let lastUid = input.lastUid;

    for (const runtimeMessage of runtimeMessages) {
      const parsed = mapRuntimeImapMessage(runtimeMessage);
      await this.inboundAdapter.parseStructuredInbound({
        messageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        from: parsed.from,
        to: parsed.to,
        subject: parsed.subject,
        textPlain: parsed.textPlain,
        htmlOriginal: parsed.htmlOriginal,
        htmlSanitized: parsed.htmlSanitized,
        attachments: parsed.attachments,
        authenticationResults: parsed.authenticationResults,
        uid: parsed.uid,
      });
      messages.push(parsed);
      if (parsed.uid != null) {
        lastUid = Math.max(lastUid, parsed.uid);
      }
    }

    return { messages, lastUid };
  }
}

export function createEmailImapClient(options?: ConstructorParameters<typeof EmailImapClient>[0]): EmailImapClient {
  return new EmailImapClient(options);
}
