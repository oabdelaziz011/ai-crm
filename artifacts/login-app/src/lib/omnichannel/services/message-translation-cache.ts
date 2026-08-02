import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import {
  translateMessageForDisplay,
} from "@/lib/omnichannel/services/message-translation-display";

const memoryCache = new Map<string, string>();

function cacheKey(messageId: string, target: ResolvedConversationLanguage): string {
  return `${messageId}:${target}`;
}

function readSessionCache(key: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(`omni-translation:${key}`);
  } catch {
    return null;
  }
}

function writeSessionCache(key: string, value: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`omni-translation:${key}`, value);
  } catch {
    /* quota */
  }
}

export function getCachedMessageTranslation(
  messageId: string,
  target: ResolvedConversationLanguage,
): string | null {
  const key = cacheKey(messageId, target);
  return memoryCache.get(key) ?? readSessionCache(key);
}

export function cacheMessageTranslation(
  messageId: string,
  target: ResolvedConversationLanguage,
  translated: string,
): void {
  const key = cacheKey(messageId, target);
  memoryCache.set(key, translated);
  writeSessionCache(key, translated);
}

export function resolveMessageTranslation(input: {
  messageId: string;
  original: string;
  from: ResolvedConversationLanguage;
  to: ResolvedConversationLanguage;
}): string {
  const cached = getCachedMessageTranslation(input.messageId, input.to);
  if (cached) return cached;
  const translated = translateMessageForDisplay(input.original, input.from, input.to);
  cacheMessageTranslation(input.messageId, input.to, translated);
  return translated;
}
