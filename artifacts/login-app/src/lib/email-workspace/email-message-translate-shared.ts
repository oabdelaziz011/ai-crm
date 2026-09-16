/**
 * Pure email translation helpers (no network / auth imports).
 */
export type EmailTranslateLanguage = {
  code: string;
  /** Native / endonym label for the selector. */
  label: string;
  /** English name for search. */
  englishName: string;
  rtl: boolean;
};

/** Curated supported target languages for Email Workspace translation. */
export const EMAIL_TRANSLATE_LANGUAGES: EmailTranslateLanguage[] = [
  { code: "ar", label: "العربية", englishName: "Arabic", rtl: true },
  { code: "en", label: "English", englishName: "English", rtl: false },
  { code: "fr", label: "Français", englishName: "French", rtl: false },
  { code: "de", label: "Deutsch", englishName: "German", rtl: false },
  { code: "es", label: "Español", englishName: "Spanish", rtl: false },
  { code: "it", label: "Italiano", englishName: "Italian", rtl: false },
  { code: "pt", label: "Português", englishName: "Portuguese", rtl: false },
  { code: "tr", label: "Türkçe", englishName: "Turkish", rtl: false },
  { code: "nl", label: "Nederlands", englishName: "Dutch", rtl: false },
  { code: "ru", label: "Русский", englishName: "Russian", rtl: false },
  { code: "zh", label: "中文", englishName: "Chinese", rtl: false },
  { code: "ja", label: "日本語", englishName: "Japanese", rtl: false },
  { code: "ko", label: "한국어", englishName: "Korean", rtl: false },
  { code: "hi", label: "हिन्दी", englishName: "Hindi", rtl: false },
  { code: "ur", label: "اردو", englishName: "Urdu", rtl: true },
  { code: "fa", label: "فارسی", englishName: "Persian", rtl: true },
  { code: "he", label: "עברית", englishName: "Hebrew", rtl: true },
  { code: "pl", label: "Polski", englishName: "Polish", rtl: false },
  { code: "sv", label: "Svenska", englishName: "Swedish", rtl: false },
  { code: "id", label: "Bahasa Indonesia", englishName: "Indonesian", rtl: false },
];

const LANGUAGE_BY_CODE = new Map(EMAIL_TRANSLATE_LANGUAGES.map((row) => [row.code, row]));

export function getEmailTranslateLanguage(code: string): EmailTranslateLanguage | null {
  return LANGUAGE_BY_CODE.get(String(code ?? "").trim().toLowerCase()) ?? null;
}

export function isRtlEmailTranslateLanguage(code: string): boolean {
  return (
    getEmailTranslateLanguage(code)?.rtl === true ||
    code === "ar" ||
    code === "ur" ||
    code === "fa" ||
    code === "he"
  );
}

export function languageLabelForCode(code: string, unknownLabel = "Unknown"): string {
  const normalized = String(code ?? "").trim().toLowerCase();
  if (!normalized || normalized === "unknown") return unknownLabel;
  return getEmailTranslateLanguage(normalized)?.englishName ?? unknownLabel;
}

/** Detect source language from message content (not UI locale). */
export function detectEmailMessageSourceLanguage(text: string): {
  code: string;
  confident: boolean;
} {
  const sample = String(text ?? "").slice(0, 4000);
  if (!sample.trim()) return { code: "unknown", confident: false };

  const arabic = (sample.match(/[\u0600-\u06FF]/g) ?? []).length;
  const hebrew = (sample.match(/[\u0590-\u05FF]/g) ?? []).length;
  const cjk = (sample.match(/[\u3040-\u30FF\u3400-\u9FFF]/g) ?? []).length;
  const cyrillic = (sample.match(/[\u0400-\u04FF]/g) ?? []).length;
  const latin = (sample.match(/[A-Za-z]/g) ?? []).length;
  const letters = arabic + hebrew + cjk + cyrillic + latin;
  if (letters < 8) return { code: "unknown", confident: false };

  if (arabic / letters > 0.35) return { code: "ar", confident: true };
  if (hebrew / letters > 0.35) return { code: "he", confident: true };
  if (cjk / letters > 0.25) return { code: "zh", confident: false };
  if (cyrillic / letters > 0.35) return { code: "ru", confident: true };

  const lower = sample.toLowerCase();
  const frHits = (
    lower.match(/\b(bonjour|merci|veuillez|votre|vous|nous|avec|pour|une|des|les|commande)\b/g) ?? []
  ).length;
  const deHits = (
    lower.match(/\b(der|die|das|und|nicht|bitte|danke|guten|ihre|nachricht|rechnung)\b/g) ?? []
  ).length;
  const esHits = (
    lower.match(/\b(hola|gracias|usted|ustedes|para|los|las|pedido|factura|favor)\b/g) ?? []
  ).length;
  if (latin > 20) {
    const best = Math.max(frHits, deHits, esHits);
    if (best >= 2) {
      if (frHits === best && frHits > deHits && frHits > esHits) {
        return { code: "fr", confident: false };
      }
      if (deHits === best && deHits > frHits && deHits > esHits) {
        return { code: "de", confident: false };
      }
      if (esHits === best && esHits > frHits && esHits > deHits) {
        return { code: "es", confident: false };
      }
    }
  }
  if (latin / letters > 0.5) return { code: "en", confident: true };
  return { code: "unknown", confident: false };
}

/** Default target: Arabic unless source is Arabic → English. */
export function defaultEmailTranslateTargetLanguage(sourceCode: string): string {
  return sourceCode === "ar" ? "en" : "ar";
}

export function emailTranslateCacheKey(messageId: string, targetLanguage: string): string {
  return `${messageId}:${String(targetLanguage).trim().toLowerCase()}`;
}

export type EmailMessageTranslationResult = {
  sourceLanguage: string;
  sourceLanguageLabel: string;
  targetLanguage: string;
  translatedText: string;
  truncated: boolean;
  neverSend?: boolean;
};

/** In-memory cache for the current session / conversation (V1 — no DB table). */
const translationMemoryCache = new Map<string, EmailMessageTranslationResult>();

export function getCachedEmailTranslation(
  messageId: string,
  targetLanguage: string,
): EmailMessageTranslationResult | null {
  return translationMemoryCache.get(emailTranslateCacheKey(messageId, targetLanguage)) ?? null;
}

export function setCachedEmailTranslation(
  messageId: string,
  targetLanguage: string,
  result: EmailMessageTranslationResult,
): void {
  translationMemoryCache.set(emailTranslateCacheKey(messageId, targetLanguage), result);
}

export function clearEmailTranslationCacheForTests(): void {
  translationMemoryCache.clear();
}
