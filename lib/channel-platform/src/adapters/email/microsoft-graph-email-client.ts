/**
 * Microsoft Graph outbound transport for Microsoft 365 mailbox connections.
 * Tokens are supplied by the server credentials loader — never from the browser.
 */

import type { EmailSmtpSendPayload, EmailSmtpSendResult } from "./email-types.js";
import { ValidationError } from "../../errors.js";
import { mapEmailProviderError } from "./email-provider-errors.js";
import { EMAIL_PROVIDER_ERROR_CODES } from "./email-provider-contract.js";

export type MicrosoftGraphAuth = {
  accessToken: string;
  /** Optional mailbox UPN / from address for sendAs checks. */
  fromEmail?: string;
};

export type MicrosoftGraphClientOptions = {
  fetchImpl?: typeof fetch;
  graphBaseUrl?: string;
};

function toGraphRecipients(emails: string | string[] | undefined): Array<{ emailAddress: { address: string } }> {
  const list = Array.isArray(emails) ? emails : emails ? [emails] : [];
  return list
    .map((email) => String(email).trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

export class MicrosoftGraphEmailClient {
  private readonly fetchImpl: typeof fetch;
  private readonly graphBaseUrl: string;

  constructor(options: MicrosoftGraphClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.graphBaseUrl = (options.graphBaseUrl ?? "https://graph.microsoft.com/v1.0").replace(/\/$/, "");
  }

  async send(auth: MicrosoftGraphAuth, payload: EmailSmtpSendPayload): Promise<EmailSmtpSendResult> {
    if (!auth.accessToken?.trim()) {
      throw new ValidationError(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
    }

    const message: Record<string, unknown> = {
      subject: payload.subject,
      body: {
        contentType: payload.html ? "HTML" : "Text",
        content: payload.html ?? payload.text ?? "",
      },
      toRecipients: toGraphRecipients(payload.to),
      ccRecipients: toGraphRecipients(payload.cc),
      bccRecipients: toGraphRecipients(payload.bcc),
    };

    if (payload.replyTo?.trim()) {
      message.replyTo = [{ emailAddress: { address: payload.replyTo.trim() } }];
    }

    // Threading: Graph prefers conversationId; internet message headers when available.
    const internetHeaders: Array<{ name: string; value: string }> = [];
    if (payload.inReplyTo?.trim()) {
      internetHeaders.push({ name: "In-Reply-To", value: payload.inReplyTo.trim() });
    }
    if (payload.references?.length) {
      internetHeaders.push({ name: "References", value: payload.references.join(" ") });
    }
    if (internetHeaders.length) {
      message.internetMessageHeaders = internetHeaders;
    }

    if (payload.attachments?.length) {
      message.attachments = payload.attachments.map((attachment) => {
        const bytes =
          typeof attachment.content === "string"
            ? Buffer.from(attachment.content)
            : attachment.content instanceof Buffer
              ? attachment.content
              : null;
        if (!bytes) {
          throw new ValidationError(`Email attachment "${attachment.filename}" is missing binary content.`);
        }
        return {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: attachment.filename,
          contentType: attachment.mimeType ?? "application/octet-stream",
          contentBytes: bytes.toString("base64"),
        };
      });
    }

    const response = await this.fetchImpl(`${this.graphBaseUrl}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (!response.ok) {
      const mapped = mapEmailProviderError(new Error(`graph_send_status_${response.status}`));
      if (response.status === 401 || response.status === 403) {
        throw new ValidationError(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
      }
      throw new ValidationError(mapped.code);
    }

    // Graph sendMail returns 202 with empty body — synthesize a stable Message-ID for ValueOR tracking.
    const syntheticId = `<graph-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@valueor.local>`;
    const accepted = [
      ...toGraphRecipients(payload.to),
      ...toGraphRecipients(payload.cc),
      ...toGraphRecipients(payload.bcc),
    ].map((r) => r.emailAddress.address);

    return {
      messageId: syntheticId,
      accepted,
      rejected: [],
      providerResponse: { provider: "microsoft_graph", status: response.status },
    };
  }

  /**
   * Fetch recent inbox messages and normalize into ParsedInboundEmail-compatible objects
   * via the shared inbound adapter elsewhere.
   */
  async listInboxMessages(
    auth: MicrosoftGraphAuth,
    input?: { top?: number; skipToken?: string | null },
  ): Promise<{
    messages: Array<Record<string, unknown>>;
    nextLink: string | null;
  }> {
    if (!auth.accessToken?.trim()) {
      throw new ValidationError(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
    }
    const top = Math.min(Math.max(input?.top ?? 25, 1), 50);
    const url =
      input?.skipToken?.trim() ||
      `${this.graphBaseUrl}/me/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,internetMessageId,conversationId,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isRead,internetMessageHeaders,hasAttachments`;

    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ValidationError(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
      }
      const mapped = mapEmailProviderError(new Error(`graph_list_status_${response.status}`));
      throw new ValidationError(mapped.code);
    }
    const json = (await response.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string };
    return {
      messages: Array.isArray(json.value) ? json.value : [],
      nextLink: typeof json["@odata.nextLink"] === "string" ? json["@odata.nextLink"] : null,
    };
  }

  async listMessageAttachments(
    auth: MicrosoftGraphAuth,
    messageId: string,
  ): Promise<Array<Record<string, unknown>>> {
    if (!auth.accessToken?.trim() || !messageId.trim()) return [];
    const encodedId = encodeURIComponent(messageId.trim());
    const response = await this.fetchImpl(`${this.graphBaseUrl}/me/messages/${encodedId}/attachments`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ValidationError(EMAIL_PROVIDER_ERROR_CODES.OAUTH_EXPIRED);
      }
      return [];
    }
    const json = (await response.json()) as { value?: Record<string, unknown>[] };
    const rows = Array.isArray(json.value) ? json.value : [];
    const attachments: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const odataType = String(row["@odata.type"] ?? "");
      if (!odataType.toLowerCase().includes("fileattachment")) continue;
      const filename =
        typeof row.name === "string" && row.name.trim() ? row.name.trim() : "attachment";
      const mimeType =
        typeof row.contentType === "string" && row.contentType.trim()
          ? row.contentType
          : "application/octet-stream";
      let contentBytes = typeof row.contentBytes === "string" ? row.contentBytes : "";
      if (!contentBytes && typeof row.id === "string" && row.id.trim()) {
        const binary = await this.fetchImpl(
          `${this.graphBaseUrl}/me/messages/${encodedId}/attachments/${encodeURIComponent(row.id)}/$value`,
          { headers: { Authorization: `Bearer ${auth.accessToken}` } },
        );
        if (binary.ok) {
          const buffer = Buffer.from(await binary.arrayBuffer());
          contentBytes = buffer.toString("base64");
        }
      }
      if (!contentBytes) continue;
      attachments.push({
        filename,
        mimeType,
        sizeBytes: typeof row.size === "number" ? row.size : Buffer.from(contentBytes, "base64").length,
        contentBase64: contentBytes,
        isInline: row.isInline === true,
        contentId: typeof row.contentId === "string" ? row.contentId : undefined,
      });
    }

    return attachments;
  }
}

export function mapGraphAttachments(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  const attachments: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const odataType = String(row["@odata.type"] ?? "");
    if (odataType && !odataType.toLowerCase().includes("fileattachment")) continue;
    const filename =
      typeof row.filename === "string" && row.filename.trim()
        ? row.filename.trim()
        : typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : "";
    const mimeType =
      typeof row.mimeType === "string"
        ? row.mimeType
        : typeof row.contentType === "string"
          ? row.contentType
          : "application/octet-stream";
    const contentBase64 =
      typeof row.contentBase64 === "string"
        ? row.contentBase64
        : typeof row.contentBytes === "string"
          ? row.contentBytes
          : undefined;
    if (!filename && !contentBase64) continue;
    attachments.push({
      filename: filename || "attachment",
      mimeType,
      sizeBytes:
        typeof row.sizeBytes === "number"
          ? row.sizeBytes
          : typeof row.size === "number"
            ? row.size
            : 0,
      contentBase64,
      isInline: row.isInline === true,
      contentId:
        typeof row.contentId === "string"
          ? row.contentId
          : typeof row.cid === "string"
            ? row.cid
            : undefined,
      related: row.related === true,
    });
  }
  return attachments;
}

/** Convert a Graph message JSON into fields usable by EmailInboundAdapter / ParsedInboundEmail. */
export function mapGraphMessageToInboundRecord(message: Record<string, unknown>): Record<string, unknown> {
  const fromObj = message.from && typeof message.from === "object" ? (message.from as Record<string, unknown>) : null;
  const fromEmailObj =
    fromObj?.emailAddress && typeof fromObj.emailAddress === "object"
      ? (fromObj.emailAddress as Record<string, unknown>)
      : null;

  const mapRecipients = (key: string) => {
    const rows = Array.isArray(message[key]) ? (message[key] as Record<string, unknown>[]) : [];
    return rows
      .map((row) => {
        const addr =
          row.emailAddress && typeof row.emailAddress === "object"
            ? (row.emailAddress as Record<string, unknown>)
            : null;
        const email = typeof addr?.address === "string" ? addr.address : "";
        if (!email) return null;
        return {
          email,
          name: typeof addr?.name === "string" ? addr.name : undefined,
        };
      })
      .filter(Boolean);
  };

  const body = message.body && typeof message.body === "object" ? (message.body as Record<string, unknown>) : null;
  const contentType = String(body?.contentType ?? "").toLowerCase();
  const content = typeof body?.content === "string" ? body.content : "";
  const internetMessageId =
    typeof message.internetMessageId === "string" && message.internetMessageId.trim()
      ? message.internetMessageId.trim()
      : typeof message.id === "string"
        ? `<graph-${message.id}@outlook.office365.com>`
        : "";

  const headers = Array.isArray(message.internetMessageHeaders)
    ? (message.internetMessageHeaders as Array<{ name?: string; value?: string }>)
    : [];
  const findHeader = (name: string) =>
    headers.find((h) => String(h.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? null;

  return {
    messageId: internetMessageId,
    providerMessageId: typeof message.id === "string" ? message.id : internetMessageId,
    externalThreadId:
      typeof message.conversationId === "string" ? message.conversationId : internetMessageId,
    // ValueOR conversation remains authoritative — conversationId is metadata only.
    microsoftConversationId: typeof message.conversationId === "string" ? message.conversationId : null,
    inReplyTo: findHeader("In-Reply-To"),
    references: String(findHeader("References") ?? "")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
    from: {
      email: typeof fromEmailObj?.address === "string" ? fromEmailObj.address : "",
      name: typeof fromEmailObj?.name === "string" ? fromEmailObj.name : undefined,
    },
    to: mapRecipients("toRecipients"),
    cc: mapRecipients("ccRecipients"),
    subject: typeof message.subject === "string" ? message.subject : "",
    textPlain:
      contentType === "text"
        ? content
        : typeof message.bodyPreview === "string" && message.bodyPreview.trim()
          ? message.bodyPreview
          : contentType === "html" && content
            ? "" // empty forces EmailInboundAdapter HTML→plain fallback
            : typeof message.bodyPreview === "string"
              ? message.bodyPreview
              : "",
    htmlOriginal: contentType === "html" ? content : undefined,
    receivedAt: typeof message.receivedDateTime === "string" ? message.receivedDateTime : undefined,
    isRead: typeof message.isRead === "boolean" ? message.isRead : null,
    attachments: mapGraphAttachments(message.attachments),
    headers: Object.fromEntries(
      headers
        .filter((h) => h.name && h.value)
        .map((h) => [String(h.name), String(h.value)]),
    ),
  };
}

export function createMicrosoftGraphEmailClient(
  options?: MicrosoftGraphClientOptions,
): MicrosoftGraphEmailClient {
  return new MicrosoftGraphEmailClient(options);
}
