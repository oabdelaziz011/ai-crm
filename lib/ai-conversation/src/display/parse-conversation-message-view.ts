import type { ConversationMessageRecord } from "../types.js";

export type ButtonOptionView = {
  id: string;
  label: string;
};

export type ListRowView = {
  id: string;
  title: string;
  description?: string;
};

export type ListSectionView = {
  title: string;
  rows: ListRowView[];
};

export type TextMessageView = {
  kind: "text";
  text: string;
};

export type ButtonsMessageView = {
  kind: "buttons";
  text: string;
  buttons: ButtonOptionView[];
};

export type ListMessageView = {
  kind: "list";
  title: string;
  body: string;
  buttonLabel: string;
  sections: ListSectionView[];
};

export type MediaMessageView = {
  kind: "media";
  url: string;
  caption?: string;
  mediaType?: string;
};

export type TemplateMessageView = {
  kind: "template";
  templateKey: string;
  language?: string;
  variables?: Record<string, unknown>;
};

export type InteractiveReplyMessageView = {
  kind: "interactive_reply";
  replyId: string;
  title?: string;
  interactionType?: string;
};

export type UnknownMessageView = {
  kind: "unknown";
  text: string;
  raw?: Record<string, unknown>;
};

export type ConversationMessageView =
  | TextMessageView
  | ButtonsMessageView
  | ListMessageView
  | MediaMessageView
  | TemplateMessageView
  | InteractiveReplyMessageView
  | UnknownMessageView;

const INTERACTIVE_REPLY_KIND = "interactive_reply";
const INTERACTIVE_REPLY_TYPES = new Set(["list_reply", "button_reply"]);

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readButtons(value: unknown): ButtonOptionView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const id = readString((entry as { id?: unknown }).id);
    const label = readString((entry as { label?: unknown }).label);
    if (!id || !label) return [];
    return [{ id, label }];
  });
}

function readListSections(value: unknown): ListSectionView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const title = readString((section as { title?: unknown }).title) ?? "Options";
    const rowsRaw = (section as { rows?: unknown }).rows;
    if (!Array.isArray(rowsRaw)) return [];
    const rows = rowsRaw.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const id = readString((row as { id?: unknown }).id);
      const rowTitle = readString((row as { title?: unknown }).title);
      if (!id || !rowTitle) return [];
      const description = readString((row as { description?: unknown }).description);
      return [{ id, title: rowTitle, ...(description ? { description } : {}) }];
    });
    if (rows.length === 0) return [];
    return [{ title, rows }];
  });
}

function isInteractiveInboundReply(metadata: Record<string, unknown>): boolean {
  if (metadata.kind === INTERACTIVE_REPLY_KIND) return true;
  const interactionType = readString(metadata.interactionType)?.toLowerCase();
  if (interactionType && INTERACTIVE_REPLY_TYPES.has(interactionType)) return true;
  return Boolean(readString(metadata.replyId));
}

function parseOutboundPayload(payload: Record<string, unknown>, fallbackText: string): ConversationMessageView {
  const kind = readString(payload.kind)?.toLowerCase();

  if (kind === "buttons") {
    const text = readString(payload.text) ?? fallbackText;
    const buttons = readButtons(payload.buttons);
    if (text && buttons.length > 0) {
      return { kind: "buttons", text, buttons };
    }
  }

  if (kind === "list") {
    const title = readString(payload.title) ?? "";
    const body = readString(payload.body) ?? fallbackText;
    const buttonLabel = readString(payload.buttonLabel) ?? "View options";
    const sections = readListSections(payload.sections);
    if (body && sections.length > 0) {
      return { kind: "list", title, body, buttonLabel, sections };
    }
  }

  if (kind === "image" || kind === "media") {
    const url = readString(payload.url);
    if (url) {
      const caption =
        readString(payload.caption) ?? readString(payload.text) ?? (fallbackText.trim() || undefined);
      const mediaType = readString(payload.mediaType) ?? (kind === "image" ? "image" : undefined);
      return { kind: "media", url, caption, mediaType };
    }
  }

  if (kind === "template") {
    const templateKey = readString(payload.templateKey);
    if (templateKey) {
      return {
        kind: "template",
        templateKey,
        language: readString(payload.language),
        variables: readRecord(payload.variables),
      };
    }
  }

  if (kind === "text" || kind === "automation_prompt" || kind === "automation_echo" || kind === "automation_response") {
    const text = readString(payload.text) ?? fallbackText;
    return { kind: "text", text: text || " " };
  }

  if (kind) {
    return { kind: "unknown", text: fallbackText || " ", raw: payload };
  }

  return { kind: "text", text: fallbackText || " " };
}

function parseIncomingMessage(message: ConversationMessageRecord): ConversationMessageView {
  const metadata = readRecord(message.metadata) ?? {};
  const fallbackText = message.content?.trim() || " ";

  if (isInteractiveInboundReply(metadata)) {
    const replyId = readString(metadata.replyId) ?? fallbackText;
    return {
      kind: "interactive_reply",
      replyId,
      title: readString(metadata.title),
      interactionType: readString(metadata.interactionType),
    };
  }

  const attachmentUrl = readString(message.attachment_url);
  if (attachmentUrl) {
    return {
      kind: "media",
      url: attachmentUrl,
      caption: fallbackText !== " " ? fallbackText : undefined,
      mediaType: readString(message.attachment_type) ?? undefined,
    };
  }

  const attachments = metadata.attachments;
  if (Array.isArray(attachments) && attachments.length > 0) {
    const first = attachments[0];
    if (first && typeof first === "object") {
      const url = readString((first as { url?: unknown }).url);
      if (url) {
        return {
          kind: "media",
          url,
          caption: readString((first as { caption?: unknown }).caption) ?? fallbackText,
          mediaType: readString((first as { type?: unknown }).type),
        };
      }
    }
  }

  return { kind: "text", text: fallbackText };
}

function parseOutgoingMessage(message: ConversationMessageRecord): ConversationMessageView {
  const metadata = readRecord(message.metadata) ?? {};
  const fallbackText = message.content?.trim() || " ";

  const whatsappTemplate = readRecord(metadata.whatsappTemplate);
  if (whatsappTemplate && readString(whatsappTemplate.name)) {
    return {
      kind: "template",
      templateKey: readString(whatsappTemplate.name)!,
      language: readString(whatsappTemplate.languageCode),
      variables: readRecord(whatsappTemplate.components as unknown),
    };
  }

  const outboundPayload = readRecord(metadata.outboundPayload);
  if (outboundPayload) {
    return parseOutboundPayload(outboundPayload, fallbackText);
  }

  const attachmentUrl = readString(message.attachment_url);
  if (attachmentUrl) {
    return {
      kind: "media",
      url: attachmentUrl,
      caption: fallbackText !== " " ? fallbackText : undefined,
      mediaType: readString(message.attachment_type) ?? undefined,
    };
  }

  return { kind: "text", text: fallbackText };
}

export function parseConversationMessageView(message: ConversationMessageRecord): ConversationMessageView {
  if (message.message_type === "incoming") {
    return parseIncomingMessage(message);
  }

  if (message.message_type === "outgoing") {
    return parseOutgoingMessage(message);
  }

  return { kind: "text", text: message.content?.trim() || " " };
}
