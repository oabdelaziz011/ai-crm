/**
 * Customer language from the message itself.
 * Company settings and the system prompt do not choose the reply language.
 * A short acknowledgement or a product name does not switch the conversation.
 */
export type CustomerLanguage = "ar" | "en" | "de";

const SHORT_ACK =
  /^(?:ok|okay|k|yes|no|yep|yeah|thanks|thank you|danke|ja|nein|تمام|ماشي|حاضر)\.?$/iu;

const OPAQUE_NAME_WORDS =
  /\b(?:welche|welcher|welches|termine|termin|uhr|frei|morgen|bitte|nicht|gibt|können|kann|möchte|moechte|buchen|leistung|ich|für|fuer|what|which|when|where|tomorrow|please|the|is|are|open|available|from|this|times|role|front|desk|product|want|book|appointment|hallo|guten|angebot|kostet|kaufen|preis)\b/iu;

const GERMAN =
  /\b(?:welche|welcher|welches|termine|termin|uhr|frei|morgen|heute|bitte|nicht|gibt|können|kann|möchte|moechte|buchen|leistung|ich|für|fuer|preis|produkt|angebot|kostet|kaufen|brauche|suche|hallo|guten|nächst(?:e|er|en|em|es)?)\b/iu;

const ENGLISH =
  /\b(?:what|which|when|where|tomorrow|please|the|is|are|open|available|from|this|times|role|front|desk|product|want|book|appointment|hi|hello|compare|battery|waterproof|specification|specs|price|quote|demo|information|help|need|would|about|service|services)\b/i;

export function detectCustomerLanguage(text: string): CustomerLanguage | null {
  const trimmed = text.trim();
  if (trimmed.length < 2 || SHORT_ACK.test(trimmed) || isOpaqueProductName(trimmed)) return null;
  if (/^(?:hi|hello|hey)(?:\s+there)?$/i.test(trimmed)) return "en";
  if (/^(?:hallo|guten tag)$/i.test(trimmed)) return "de";
  const withoutNames = trimmed.replace(/\b[A-Z][\p{L}\p{N}.&-]*(?:\s+[A-Z][\p{L}\p{N}.&-]*)*/gu, " ");
  const arabic = (withoutNames.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (withoutNames.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length;
  if (arabic >= 4 && latin >= 4 && Math.abs(arabic - latin) <= Math.max(3, Math.floor(Math.max(arabic, latin) * 0.2))) {
    return null;
  }
  if (arabic >= 2 && arabic >= latin) return "ar";
  if (GERMAN.test(trimmed) || (/[äöüß]/i.test(trimmed) && latin >= 2 && arabic === 0)) return "de";
  if (ENGLISH.test(trimmed)) return "en";
  if (isCatalogToken(trimmed)) return null;
  if (latin >= 2 && arabic === 0) return "en";
  return null;
}

/** A SKU, code, or bare amount. It is not a language switch. */
function isCatalogToken(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9._-]{1,47}$/i.test(value) || /^[\d\s.,€$£]+(?:\s*(?:egp|usd|eur|euro))?$/i.test(value);
}

function isOpaqueProductName(value: string): boolean {
  const trimmed = value.trim().replace(/[?؟!.]+$/u, "");
  if (!trimmed || trimmed.length > 48 || /\d/.test(trimmed)) return false;
  if (/[\u0600-\u06FF]/.test(trimmed)) return false;
  if (OPAQUE_NAME_WORDS.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/);
  return tokens.length <= 4 && tokens.every((token) => /^[\p{L}.'’-]+$/u.test(token));
}

export function resolveConversationLanguage(input: {
  userTexts: readonly string[];
  latestAssistant?: string;
}): CustomerLanguage {
  const users = input.userTexts.map((text) => text.trim()).filter(Boolean);
  const latest = users.at(-1) ?? "";
  const latestSignal = detectCustomerLanguage(latest);
  if (latestSignal) return latestSignal;
  const assistantSignal = detectCustomerLanguage(input.latestAssistant ?? "");
  if (assistantSignal) return assistantSignal;
  for (const text of [...users].reverse()) {
    const signal = detectCustomerLanguage(text);
    if (signal) return signal;
  }
  return "ar";
}
