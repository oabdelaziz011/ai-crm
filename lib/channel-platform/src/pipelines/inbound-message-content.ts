import type { NormalizedInboundMessageDto } from "../dto/channel-dto.js";

const INTERACTIVE_REPLY_KIND = "interactive_reply";
const INTERACTIVE_REPLY_TYPES = new Set(["list_reply", "button_reply"]);

export function isInteractiveInboundReply(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false;
  if (metadata.kind === INTERACTIVE_REPLY_KIND) return true;

  if (typeof metadata.interactionType === "string") {
    const interactionType = metadata.interactionType.trim().toLowerCase();
    if (INTERACTIVE_REPLY_TYPES.has(interactionType)) return true;
  }

  return typeof metadata.replyId === "string" && metadata.replyId.trim().length > 0;
}

export function hasValidInboundContent(normalized: NormalizedInboundMessageDto): boolean {
  if (normalized.text.trim()) return true;
  if (normalized.attachments.length > 0) return true;
  return isInteractiveInboundReply(normalized.metadata);
}

export function resolveInboundMessageText(normalized: NormalizedInboundMessageDto): string {
  const text = normalized.text.trim();
  if (text) return text;

  const metadata = normalized.metadata ?? {};
  const title = typeof metadata.title === "string" ? metadata.title.trim() : "";
  if (title) return title;

  const replyId = typeof metadata.replyId === "string" ? metadata.replyId.trim() : "";
  if (replyId) return replyId;

  return "";
}
