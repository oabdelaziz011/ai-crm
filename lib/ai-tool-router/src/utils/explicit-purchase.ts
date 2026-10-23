import {
  extractPhoneFromCustomerText,
  validateEgyptMobilePhone,
} from "./customer-phone-normalization.js";

/**
 * Explicit buy or quote intent. A price question or general product interest is not enough.
 * Kept aligned with lead-platform conversation evidence, without importing that package here.
 */
const EXPLICIT_PURCHASE =
  /\b(i want to buy|i'd like to buy|i would like to buy|ready to buy|want to purchase|want to order|send me a quote|request a quote|please (?:send|prepare|draft) (?:me )?a quote)\b|(?<!not )(?<!not\s)\b(?:buy|purchase)\b|عايز(?:ة|ين)?\s*(?:أشتري|اشتري)|هشتري|أشتري|اشتري|نشتري|عرض\s*سعر|ا?بعت(?:لي|وا)?\s*عرض/iu;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const ENGLISH_NAME =
  /\b(?:my name is|i am|i'm)\s+([A-Za-z]{2,}(?:\s+[A-Za-z]{2,}){1,3})\b/i;
const ARABIC_NAME = /اسمي\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,3})/u;

export function messageHasExplicitPurchase(texts: readonly string[]): boolean {
  return texts.some((text) => EXPLICIT_PURCHASE.test(text));
}

/**
 * One Egyptian mobile already written in the text, as E.164.
 * Two different valid mobiles return null so a stored number is not overwritten.
 */
export function extractSingleEgyptianMobileE164(text: string): string | null {
  const matches = text.match(/(?:\+?20)?0?1[0125]\d{8}/g) ?? [];
  const e164s = new Set<string>();
  for (const match of matches) {
    const validated = validateEgyptMobilePhone(match);
    if (!validated.valid) continue;
    e164s.add(`+${validated.normalized}`);
  }
  if (e164s.size === 1) return [...e164s][0]!;
  if (e164s.size > 1) return null;
  const fallback = extractPhoneFromCustomerText(text);
  if (!fallback) return null;
  const validated = validateEgyptMobilePhone(fallback);
  return validated.valid ? `+${validated.normalized}` : null;
}

export function extractPurchaseContact(text: string): {
  name: string | null;
  email: string | null;
  phoneE164: string | null;
} {
  const nameMatch = ENGLISH_NAME.exec(text) ?? ARABIC_NAME.exec(text);
  const emailMatch = EMAIL.exec(text);
  return {
    name: nameMatch?.[1]?.trim() ?? null,
    email: emailMatch?.[0]?.trim().toLowerCase() ?? null,
    phoneE164: extractSingleEgyptianMobileE164(text),
  };
}
