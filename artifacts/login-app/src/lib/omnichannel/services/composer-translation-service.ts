import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import {
  stripInternalTranslationMarkers,
  translateMessageForDisplay,
} from "@/lib/omnichannel/services/message-translation-display";
import { isAuthenticatedApiConfigured } from "@/lib/api-server/normalize-api-base";

const ARABIC_RE = /[\u0600-\u06FF]/;
const MENTION_RE = /@[A-Za-z0-9_.\u0600-\u06FF-]+/g;
const MAX_TRANSLATION_LENGTH = 8_000;

export type ComposerDetectedLanguage = ResolvedConversationLanguage | "unknown";

export function detectComposerLanguage(text: string): ComposerDetectedLanguage {
  const trimmed = stripInternalTranslationMarkers(text);
  if (!trimmed) return "unknown";
  if (ARABIC_RE.test(trimmed)) return "ar";
  if (/[a-z]/i.test(trimmed)) return "en";
  return "unknown";
}

export function extractMentionTokens(text: string): string[] {
  return text.match(MENTION_RE) ?? [];
}

/**
 * Validate/sanitize model or phrase-map output before writing into the composer.
 * Returns null when the result is unsafe/malformed (caller keeps original draft).
 */
export function validateComposerTranslationOutput(
  raw: string,
  original: string,
): string | null {
  let text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;

  // Structured JSON salvage
  if (/^\s*[{[]/.test(text) && /[}\]]\s*$/.test(text)) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const candidate =
        (typeof parsed.translatedText === "string" && parsed.translatedText) ||
        (typeof parsed.translation === "string" && parsed.translation) ||
        (typeof parsed.text === "string" && parsed.text) ||
        "";
      text = candidate.trim();
    } catch {
      return null;
    }
  }

  text = stripInternalTranslationMarkers(text);
  if (!text) return null;
  if (text.length > MAX_TRANSLATION_LENGTH) return null;
  if (/system prompt|ignore previous instructions|api[_ -]?key|sk-[a-z0-9]{10,}/i.test(text)) {
    return null;
  }
  if (/^\s*[{[]/.test(text) && /[}\]]\s*$/.test(text)) return null;

  // Preserve mentions that existed in the original draft.
  const originalMentions = extractMentionTokens(original);
  for (const mention of originalMentions) {
    if (!text.includes(mention)) {
      text = `${text.trimEnd()} ${mention}`.trim();
    }
  }

  return text;
}

function buildTranslationSystemPrompt(target: ResolvedConversationLanguage): string {
  const language = target === "ar" ? "Arabic" : "English";
  return [
    "You translate customer-service agent draft replies.",
    "Return ONLY the translated message text.",
    "Do not add labels, prefixes, metadata, or wrappers.",
    "Never include the words Translation, ترجمة, [Translation], or [ترجمة].",
    "Do not send messages or call tools.",
    "Preserve @mention tokens exactly (do not translate them).",
    `Target language: ${language}.`,
  ].join("\n");
}

async function translateWithPlatformAi(input: {
  text: string;
  target: ResolvedConversationLanguage;
  companyId: string;
}): Promise<string> {
  // Dynamic import keeps unit tests free of browser Supabase env bootstrap.
  const { platformAiChatCompletion } = await import("@/lib/platform-ai/platform-ai-api-client");
  const languageName = input.target === "ar" ? "Arabic" : "English";
  const response = await platformAiChatCompletion({
    companyId: input.companyId,
    providerKey: "openai",
    useCase: "chat",
    temperature: 0.2,
    maxTokens: 800,
    messages: [
      { role: "system", content: buildTranslationSystemPrompt(input.target) },
      {
        role: "user",
        content: [
          `Translate the following agent draft into ${languageName}.`,
          "Return only the translated draft text.",
          "",
          input.text,
        ].join("\n"),
      },
    ],
  });
  return response.text ?? "";
}

/**
 * Sync phrase-map translation for composer drafts.
 * Never emits internal `[Translation]` markers.
 */
export function translateComposerDraft(input: {
  text: string;
  target: ResolvedConversationLanguage;
}): { source: ComposerDetectedLanguage; translated: string } {
  const cleaned = stripInternalTranslationMarkers(input.text);
  const source = detectComposerLanguage(cleaned);
  if (!cleaned) {
    return { source, translated: "" };
  }
  if (source === input.target) {
    return { source, translated: cleaned };
  }
  const from: ResolvedConversationLanguage =
    source === "unknown" ? (input.target === "ar" ? "en" : "ar") : source;
  const translated = translateMessageForDisplay(cleaned, from, input.target);
  const validated = validateComposerTranslationOutput(translated, cleaned) ?? cleaned;
  return { source, translated: validated };
}

/**
 * One-shot composer translation: prefer Platform AI; fall back to phrase-map.
 * Never recursively re-translates its own output within a single call.
 */
export async function translateComposerDraftAsync(input: {
  text: string;
  target: ResolvedConversationLanguage;
  companyId?: string | null;
}): Promise<{ source: ComposerDetectedLanguage; translated: string; via: "llm" | "catalog" }> {
  const cleaned = stripInternalTranslationMarkers(input.text);
  const source = detectComposerLanguage(cleaned);
  if (!cleaned) {
    return { source, translated: "", via: "catalog" };
  }
  if (source === input.target) {
    return { source, translated: cleaned, via: "catalog" };
  }

  const companyId = input.companyId?.trim() ?? "";
  if (companyId && isAuthenticatedApiConfigured()) {
    try {
      const raw = await translateWithPlatformAi({
        text: cleaned,
        target: input.target,
        companyId,
      });
      const validated = validateComposerTranslationOutput(raw, cleaned);
      if (validated) {
        return { source, translated: validated, via: "llm" };
      }
    } catch {
      // Fall through to catalog path
    }
  }

  const catalog = translateComposerDraft({ text: cleaned, target: input.target });
  if (!catalog.translated || catalog.translated === cleaned) {
    throw new Error("translation_unavailable");
  }
  return { source: catalog.source, translated: catalog.translated, via: "catalog" };
}

export function insertBelowDraft(current: string, translated: string): string {
  const trimmed = current.trimEnd();
  const cleanTranslated = stripInternalTranslationMarkers(translated);
  if (!trimmed) return cleanTranslated;
  return `${trimmed}\n\n${cleanTranslated}`;
}
