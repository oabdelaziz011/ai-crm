export const INSTAGRAM_QUICK_REPLY_LIMIT = 13;
export const INSTAGRAM_QUICK_REPLY_TITLE_MAX = 20;
export const INSTAGRAM_QUICK_REPLY_PAYLOAD_MAX = 1000;

export type InstagramQuickReply = {
  content_type: "text";
  title: string;
  payload: string;
};

export type InstagramQuickReplyOption = {
  id: string;
  title: string;
};

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function truncateInstagramQuickReplyTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= INSTAGRAM_QUICK_REPLY_TITLE_MAX) return trimmed;
  return trimmed.slice(0, INSTAGRAM_QUICK_REPLY_TITLE_MAX);
}

export function collectInstagramQuickReplyOptions(
  structured: Record<string, unknown>,
): InstagramQuickReplyOption[] {
  const kind = readTrimmedString(structured.kind);
  const options: InstagramQuickReplyOption[] = [];

  if (kind === "buttons" && Array.isArray(structured.buttons)) {
    for (const button of structured.buttons) {
      if (!button || typeof button !== "object") continue;
      const record = button as Record<string, unknown>;
      const id = readTrimmedString(record.id);
      const title = readTrimmedString(record.label) || readTrimmedString(record.title);
      if (!id || !title) continue;
      options.push({ id, title });
    }
    return options;
  }

  if (kind === "list" && Array.isArray(structured.sections)) {
    for (const section of structured.sections) {
      if (!section || typeof section !== "object") continue;
      const rows = (section as { rows?: unknown }).rows;
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        const id = readTrimmedString(record.id);
        const title = readTrimmedString(record.title);
        if (!id || !title) continue;
        options.push({ id, title });
      }
    }
  }

  return options;
}

export function resolveInstagramInteractiveText(
  structured: Record<string, unknown>,
  fallback: string,
): string {
  const kind = readTrimmedString(structured.kind);
  if (kind === "buttons") {
    const text = readTrimmedString(structured.text);
    if (text) return text;
  }
  if (kind === "list") {
    const body = readTrimmedString(structured.body);
    if (body) return body;
    const title = readTrimmedString(structured.title);
    if (title) return title;
  }
  return fallback.trim();
}

export function toInstagramQuickReplies(
  options: InstagramQuickReplyOption[],
): InstagramQuickReply[] {
  const replies: InstagramQuickReply[] = [];
  for (const option of options.slice(0, INSTAGRAM_QUICK_REPLY_LIMIT)) {
    const payload = option.id.trim().slice(0, INSTAGRAM_QUICK_REPLY_PAYLOAD_MAX);
    const title = truncateInstagramQuickReplyTitle(option.title);
    if (!payload || !title) continue;
    replies.push({
      content_type: "text",
      title,
      payload,
    });
  }
  return replies;
}

export function formatInstagramOverflowText(
  text: string,
  options: InstagramQuickReplyOption[],
): string {
  const overflow = options.slice(INSTAGRAM_QUICK_REPLY_LIMIT);
  if (overflow.length === 0) return text;
  const lines = overflow.map((option, index) => `${INSTAGRAM_QUICK_REPLY_LIMIT + index + 1}. ${option.title.trim()}`);
  return `${text}\n${lines.join("\n")}`;
}

export function formatInstagramInteractiveOutbound(
  recipientId: string,
  fallbackText: string,
  structured: Record<string, unknown> | undefined,
): {
  payload: {
    recipient: { id: string };
    message: { text: string; quick_replies: InstagramQuickReply[] };
  };
  recipient: string;
} | null {
  if (!structured) return null;
  const options = collectInstagramQuickReplyOptions(structured);
  const quickReplies = toInstagramQuickReplies(options);
  if (quickReplies.length === 0) return null;

  const text =
    formatInstagramOverflowText(resolveInstagramInteractiveText(structured, fallbackText), options) ||
    fallbackText.trim() ||
    " ";

  return {
    payload: {
      recipient: { id: recipientId },
      message: {
        text,
        quick_replies: quickReplies,
      },
    },
    recipient: recipientId,
  };
}
