import { AttachmentEngine } from "../../engines/attachment-engine.js";
import { ValidationError } from "../../errors.js";
import type { ParsedInboundEmail } from "./email-types.js";
import { buildReplySubject, htmlToPlainText, normalizeEmailMessageId, sanitizeEmailHtml } from "./email-html-utils.js";
import { parseAuthenticationResultsHeader, validateInboundEmailSecurity } from "./email-security.js";
import type { EmailVirusScanHook } from "./email-security.js";

export type EmailInboundAdapterOptions = {
  maxAttachmentBytes?: number;
  virusScanHook?: EmailVirusScanHook;
};

export class EmailInboundAdapter {
  private readonly attachmentEngine = new AttachmentEngine();
  private readonly maxAttachmentBytes: number;
  private readonly virusScanHook?: EmailVirusScanHook;

  constructor(options: EmailInboundAdapterOptions = {}) {
    this.maxAttachmentBytes = options.maxAttachmentBytes ?? 26214400;
    this.virusScanHook = options.virusScanHook;
  }

  async parseStructuredInbound(raw: Record<string, unknown>): Promise<ParsedInboundEmail> {
    const messageId =
      typeof raw.messageId === "string"
        ? raw.messageId
        : typeof raw.message_id === "string"
          ? raw.message_id
          : "";

    if (!messageId.trim()) {
      throw new ValidationError("Email inbound payload missing Message-ID.");
    }

    const from = this.readAddress(raw.from ?? raw.sender);
    if (!from.email) {
      throw new ValidationError("Email inbound payload missing sender address.");
    }

    const htmlOriginal =
      typeof raw.htmlOriginal === "string"
        ? raw.htmlOriginal
        : typeof raw.html === "string"
          ? raw.html
          : undefined;

    const htmlSanitized =
      typeof raw.htmlSanitized === "string"
        ? raw.htmlSanitized
        : htmlOriginal
          ? sanitizeEmailHtml(htmlOriginal)
          : undefined;

    const textPlain =
      typeof raw.textPlain === "string"
        ? raw.textPlain.trim()
        : typeof raw.text === "string"
          ? raw.text.trim()
          : htmlOriginal
            ? htmlToPlainText(htmlOriginal)
            : "";

    const references = this.readReferences(raw.references ?? raw.emailReferences);
    const authenticationResults =
      raw.authenticationResults && typeof raw.authenticationResults === "object"
        ? (raw.authenticationResults as ParsedInboundEmail["authenticationResults"])
        : parseAuthenticationResultsHeader(
            typeof raw.authenticationResultsHeader === "string"
              ? raw.authenticationResultsHeader
              : typeof raw.headers === "object" && raw.headers
                ? String((raw.headers as Record<string, unknown>)["authentication-results"] ?? "")
                : undefined,
          );

    const attachments = this.readAttachments(raw.attachments);

    const security = await validateInboundEmailSecurity({
      authenticationResults,
      attachments: attachments.map((item) => ({
        filename: item.filename,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
      })),
      maxAttachmentBytes: this.maxAttachmentBytes,
      virusScanHook: this.virusScanHook,
    });

    if (!security.ok) {
      throw new ValidationError(`Email inbound rejected: ${security.errors.join(", ")}`);
    }

    return {
      uid: typeof raw.uid === "number" ? raw.uid : undefined,
      messageId: normalizeEmailMessageId(messageId),
      inReplyTo:
        typeof raw.inReplyTo === "string"
          ? normalizeEmailMessageId(raw.inReplyTo)
          : typeof raw.in_reply_to === "string"
            ? normalizeEmailMessageId(raw.in_reply_to)
            : null,
      references,
      from,
      to: this.readAddressList(raw.to),
      cc: this.readAddressList(raw.cc),
      subject: typeof raw.subject === "string" ? raw.subject.trim() : "",
      textPlain,
      htmlOriginal,
      htmlSanitized,
      receivedAt: typeof raw.receivedAt === "string" ? raw.receivedAt : undefined,
      attachments,
      authenticationResults: security.authenticationResults,
      headers:
        typeof raw.headers === "object" && raw.headers ? (raw.headers as Record<string, string>) : undefined,
    };
  }

  buildWebhookPayload(parsed: ParsedInboundEmail, resolvedExternalThreadId: string): Record<string, unknown> {
    const normalizedAttachments = this.attachmentEngine.normalizeAttachments(
      parsed.attachments.map((attachment, index) => ({
        attachmentId: attachment.attachmentId || `email-attachment-${index + 1}`,
        type: this.mapAttachmentType(attachment.mimeType),
        url: attachment.url,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
        metadata: {
          sizeBytes: attachment.sizeBytes,
        },
      })),
    );

    return {
      kind: "email.inbound",
      messageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      resolvedExternalThreadId,
      senderExternalId: parsed.from.email,
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc ?? [],
      subject: parsed.subject,
      textPlain: parsed.textPlain,
      htmlOriginal: parsed.htmlOriginal,
      htmlSanitized: parsed.htmlSanitized,
      attachments: normalizedAttachments,
      authenticationResults: parsed.authenticationResults,
      securityWarnings: [],
      uid: parsed.uid,
    };
  }

  private mapAttachmentType(mimeType: string): "document" | "image" | "video" | "audio" {
    const normalized = mimeType.toLowerCase();
    if (normalized.startsWith("image/")) return "image";
    if (normalized.startsWith("video/")) return "video";
    if (normalized.startsWith("audio/")) return "audio";
    return "document";
  }

  private readReferences(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? normalizeEmailMessageId(item) : ""))
        .filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(/\s+/)
        .map((item) => normalizeEmailMessageId(item))
        .filter(Boolean);
    }
    return [];
  }

  private readAddress(value: unknown): { email: string; name?: string } {
    if (typeof value === "string") {
      return { email: value.trim().toLowerCase() };
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return {
        email: typeof record.email === "string" ? record.email.trim().toLowerCase() : "",
        name: typeof record.name === "string" ? record.name.trim() : undefined,
      };
    }
    return { email: "" };
  }

  private readAddressList(value: unknown): Array<{ email: string; name?: string }> {
    if (!Array.isArray(value)) {
      if (typeof value === "string" && value.trim()) {
        return [{ email: value.trim().toLowerCase() }];
      }
      return [];
    }
    return value.map((item) => this.readAddress(item)).filter((item) => item.email);
  }

  private readAttachments(value: unknown): ParsedInboundEmail["attachments"] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const filename =
          typeof record.filename === "string" ? record.filename.trim() : `attachment-${index + 1}`;
        const mimeType =
          typeof record.mimeType === "string"
            ? record.mimeType
            : typeof record.contentType === "string"
              ? record.contentType
              : "application/octet-stream";
        const sizeBytes =
          typeof record.sizeBytes === "number"
            ? record.sizeBytes
            : typeof record.size === "number"
              ? record.size
              : 0;

        return {
          attachmentId:
            typeof record.attachmentId === "string" ? record.attachmentId : `email-attachment-${index + 1}`,
          filename,
          mimeType,
          sizeBytes,
          url: typeof record.url === "string" ? record.url : undefined,
        };
      })
      .filter((item): item is ParsedInboundEmail["attachments"][number] => item !== null);
  }
}

export function buildEmailOutboundMetadata(input: {
  recipientEmail?: string | null;
  inReplyTo?: string;
  emailSubject?: string;
  emailReferences?: string[];
  threadRootMessageId?: string;
}): Record<string, unknown> {
  return {
    recipientEmail: input.recipientEmail ?? undefined,
    inReplyTo: input.inReplyTo,
    emailSubject: input.emailSubject ? buildReplySubject(input.emailSubject) : undefined,
    emailReferences: input.emailReferences,
    threadRootMessageId: input.threadRootMessageId,
  };
}
