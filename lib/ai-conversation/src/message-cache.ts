import type { MessageType, ParticipantType } from "./constants.js";

const PREVIEW_MAX_LENGTH = 280;
const SEARCH_MAX_LENGTH = 2000;

export function buildMessagePreview(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= PREVIEW_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, PREVIEW_MAX_LENGTH - 1)}…`;
}

export function buildMessageSearchText(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH);
}

export function buildConversationSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_LENGTH);
}

export function resolveParticipantTypeForCache(
  participantType: ParticipantType | null | undefined,
  messageType: MessageType,
): ParticipantType | null {
  if (participantType) return participantType;
  if (messageType === "incoming") return "customer";
  if (messageType === "outgoing") return "employee";
  if (messageType === "system") return "system";
  return null;
}

export function resolveUnreadDelta(messageType: MessageType): {
  employee: number;
  customer: number;
} {
  if (messageType === "incoming") {
    return { employee: 1, customer: 0 };
  }
  if (messageType === "outgoing") {
    return { employee: 0, customer: 1 };
  }
  return { employee: 0, customer: 0 };
}
