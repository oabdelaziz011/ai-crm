/**
 * Infer reply language from the customer's latest clear message.
 * A name, SKU, or short acknowledgement does not switch the conversation.
 * Arabic script → Arabic. Clear German wording → German. Other clear Latin → English.
 * An umlaut inside a name such as Müller is not enough to switch language.
 * When nothing in the thread is clear, Latin text stays English (channel default).
 */
export type ReplyLanguageName = "Arabic" | "English" | "German";

const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const GERMAN_WORDS =
  /\b(?:welche|welcher|welches|termine|termin|uhr|frei|morgen|bitte|nicht|gibt|können|kann|möchte|moechte|buchen|leistung|ich|für|fuer|preis|produkt|nächst(?:e|er|en|em|es)?)\b/iu;
const ENGLISH_WORDS =
  /\b(?:what|which|when|where|tomorrow|please|hello|hi|hey|the|is|are|open|available|from|this|times|yes|no|want|book|appointment)\b/i;

function isShortAck(value: string): boolean {
  return /^(?:ok|okay|k|yes|no|yep|yeah|thanks|thank you|danke|ja|nein|تمام|ماشي|حاضر)\.?$/iu.test(
    value.trim(),
  );
}

function isOpaqueName(value: string): boolean {
  const trimmed = value.trim().replace(/[?؟!.]+$/u, "");
  if (!trimmed || trimmed.length > 48 || /\d/.test(trimmed)) return false;
  if (ARABIC_SCRIPT.test(trimmed)) return false;
  if (GERMAN_WORDS.test(trimmed) || ENGLISH_WORDS.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/);
  return tokens.length <= 4 && tokens.every((token) => /^[\p{L}.'’-]+$/u.test(token));
}

function languageSignal(value: string): ReplyLanguageName | null {
  const trimmed = value.trim();
  if (trimmed.length < 2 || isShortAck(trimmed) || isOpaqueName(trimmed)) return null;
  if (/^(?:hi|hello|hey)(?:\s+there)?$/i.test(trimmed)) return "English";
  const arabic = (trimmed.match(new RegExp(ARABIC_SCRIPT.source, "g")) ?? []).length;
  const latin = (trimmed.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length;
  if (arabic >= 2 && arabic >= latin) return "Arabic";
  if (GERMAN_WORDS.test(trimmed)) return "German";
  if (ENGLISH_WORDS.test(trimmed)) return "English";
  if (arabic >= 1 && latin === 0) return "Arabic";
  return null;
}

export function detectReplyLanguage(
  text: string | null | undefined,
  earlierUserTexts: readonly string[] = [],
): ReplyLanguageName {
  const latest = typeof text === "string" ? text : "";
  const thread = [...earlierUserTexts, latest];
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const signal = languageSignal(thread[index] ?? "");
    if (signal) return signal;
  }
  return "English";
}
