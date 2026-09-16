const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const STRONG_LTR_RE = /^[\d\s+\-().@:/#A-Za-z_]+$/;
const PHONE_RE = /^[+]?[\d\s().-]{6,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.)/i;
const ORDER_ID_RE = /^[#A-Z0-9-]{4,}$/i;

export type TextDirection = "rtl" | "ltr" | "auto";

export type LtrFieldKind = "phone" | "email" | "url" | "invoice" | "orderId" | "number";

export type ComposerTextDirection = "ltr" | "rtl";

export function containsArabicScript(text: string): boolean {
  return ARABIC_RE.test(text);
}

export function containsLatinScript(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

/**
 * Unicode first-strong directional character (HTML `dir=auto` style).
 * Skips neutrals / weak types (whitespace, punctuation, digits, most emoji, marks)
 * and returns the first strong L / R / AL.
 */
export function detectFirstStrongDirection(text: string): ComposerTextDirection | null {
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code == null) continue;
    const strong = bidiStrongType(code);
    if (strong === "L") return "ltr";
    if (strong === "R" || strong === "AL") return "rtl";
  }
  return null;
}

function bidiStrongType(code: number): "L" | "R" | "AL" | null {
  // Arabic letter (AL) ranges commonly used in Omnichannel drafts.
  if (
    (code >= 0x0600 && code <= 0x06ff)
    || (code >= 0x0750 && code <= 0x077f)
    || (code >= 0x08a0 && code <= 0x08ff)
    || (code >= 0xfb50 && code <= 0xfdff)
    || (code >= 0xfe70 && code <= 0xfeff)
  ) {
    // Arabic digits are AN (weak) — not strong.
    if (code >= 0x0660 && code <= 0x0669) return null;
    if (code >= 0x06f0 && code <= 0x06f9) return null;
    // Common Arabic punctuation / signs are neutrals.
    if (
      code === 0x060c
      || code === 0x061b
      || code === 0x061f
      || code === 0x0640
      || (code >= 0x066a && code <= 0x066d)
    ) {
      return null;
    }
    return "AL";
  }

  // Hebrew letters (R).
  if (
    (code >= 0x0590 && code <= 0x05ff)
    || (code >= 0xfb1d && code <= 0xfb4f)
  ) {
    return "R";
  }

  // Basic Latin letters + Latin-1 / extended Latin letters (L).
  if (
    (code >= 0x0041 && code <= 0x005a)
    || (code >= 0x0061 && code <= 0x007a)
    || (code >= 0x00c0 && code <= 0x00d6)
    || (code >= 0x00d8 && code <= 0x00f6)
    || (code >= 0x00f8 && code <= 0x024f)
    || (code >= 0x1e00 && code <= 0x1eff)
  ) {
    return "L";
  }

  return null;
}

/** Detect direction from actual text content — never from page locale alone. */
export function detectTextDirection(text: string): TextDirection {
  const trimmed = text.trim();
  if (!trimmed) return "auto";
  return detectFirstStrongDirection(trimmed) ?? "auto";
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

/**
 * Composer direction follows the draft's first strong Unicode character.
 * Empty draft uses the application locale fallback (not browser `auto`).
 */
export function composerDirAttribute(
  draft: string,
  localeFallback: ComposerTextDirection = "ltr",
): ComposerTextDirection {
  if (!draft.trim()) return localeFallback;
  return detectFirstStrongDirection(draft) ?? localeFallback;
}

export function composerTextAlign(dir: ComposerTextDirection): "left" | "right" {
  return dir === "rtl" ? "right" : "left";
}

export function resolveLocaleTextDirection(languageOrDir: string | null | undefined): ComposerTextDirection {
  const value = (languageOrDir ?? "").trim().toLowerCase();
  if (value === "rtl" || value.startsWith("ar") || value.includes("arab")) return "rtl";
  return "ltr";
}
