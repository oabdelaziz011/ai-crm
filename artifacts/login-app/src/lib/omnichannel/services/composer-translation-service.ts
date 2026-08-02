import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import {
  translateMessageForDisplay,
} from "@/lib/omnichannel/services/message-translation-display";

const ARABIC_RE = /[\u0600-\u06FF]/;

export type ComposerDetectedLanguage = ResolvedConversationLanguage | "unknown";

export function detectComposerLanguage(text: string): ComposerDetectedLanguage {
  const trimmed = text.trim();
  if (!trimmed) return "unknown";
  if (ARABIC_RE.test(trimmed)) return "ar";
  if (/[a-z]/i.test(trimmed)) return "en";
  return "unknown";
}

export function translateComposerDraft(input: {
  text: string;
  target: ResolvedConversationLanguage;
}): { source: ComposerDetectedLanguage; translated: string } {
  const source = detectComposerLanguage(input.text);
  const from: ResolvedConversationLanguage =
    source === "unknown" ? (input.target === "ar" ? "en" : "ar") : source;
  const translated = translateMessageForDisplay(input.text, from, input.target);
  return { source, translated };
}

export function insertBelowDraft(current: string, translated: string): string {
  const trimmed = current.trimEnd();
  if (!trimmed) return translated;
  return `${trimmed}\n\n${translated}`;
}
