const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const STRONG_LTR_RE = /^[\d\s+\-().@:/#A-Za-z_]+$/;
const PHONE_RE = /^[+]?[\d\s().-]{6,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.)/i;
const ORDER_ID_RE = /^[#A-Z0-9-]{4,}$/i;

export type TextDirection = "rtl" | "ltr" | "auto";

export type LtrFieldKind = "phone" | "email" | "url" | "invoice" | "orderId" | "number";

export function containsArabicScript(text: string): boolean {
  return ARABIC_RE.test(text);
}

export function containsLatinScript(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

/** Detect direction from actual text content — never from page locale. */
export function detectTextDirection(text: string): TextDirection {
  const trimmed = text.trim();
  if (!trimmed) return "auto";

  const arabicChars = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) ?? []).length;
  const latinChars = (trimmed.match(/[A-Za-z]/g) ?? []).length;

  if (arabicChars > 0 && latinChars === 0) return "rtl";
  if (latinChars > 0 && arabicChars === 0) return "ltr";
  if (arabicChars > latinChars) return "rtl";
  if (latinChars > arabicChars) return "ltr";
  return "auto";
}

export function dirAttributeForText(text: string, forceLtr = false): "auto" | "rtl" | "ltr" {
  if (forceLtr || isAlwaysLtrValue(text)) return "ltr";
  const direction = detectTextDirection(text);
  return direction === "auto" ? "auto" : direction;
}

export function isAlwaysLtrValue(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (PHONE_RE.test(trimmed)) return true;
  if (EMAIL_RE.test(trimmed)) return true;
  if (URL_RE.test(trimmed)) return true;
  if (ORDER_ID_RE.test(trimmed)) return true;
  if (/^\d+([.,]\d+)?$/.test(trimmed)) return true;
  if (STRONG_LTR_RE.test(trimmed)) return true;
  return false;
}

export function dirAttributeForField(value: string, kind?: LtrFieldKind): "auto" | "rtl" | "ltr" {
  if (!value.trim()) return "auto";
  if (
    kind === "phone"
    || kind === "email"
    || kind === "url"
    || kind === "invoice"
    || kind === "orderId"
    || kind === "number"
  ) {
    return "ltr";
  }
  return dirAttributeForText(value);
}

/** Composer direction follows the text being typed. */
export function composerDirAttribute(draft: string): "auto" | "rtl" | "ltr" {
  if (!draft.trim()) return "auto";
  return dirAttributeForText(draft);
}
