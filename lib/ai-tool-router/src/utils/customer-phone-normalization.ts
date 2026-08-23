const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Convert Arabic-Indic / Persian digits to ASCII before normalization. */
export function convertArabicDigitsToAscii(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - "٠".charCodeAt(0)))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - "۰".charCodeAt(0)));
}

export function stripPhoneFormatting(value: string): string {
  return convertArabicDigitsToAscii(value).replace(/\D/g, "");
}

/** Reject DDMMYYYY / YYYYMMDD fragments so dates are not treated as phones. */
export function looksLikeCalendarDateDigits(digits: string): boolean {
  if (digits.length !== 8) return false;
  if (/^(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(digits)) return true;
  if (/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})$/.test(digits)) return true;
  return false;
}

/**
 * Egypt-centric storage normalization used across booking intake and CRM lookup.
 * Returns digits-only with optional leading country code 20.
 */
export function normalizeEgyptMobilePhone(value: string): string {
  const digits = stripPhoneFormatting(value);
  if (digits.startsWith("20") && digits.length >= 12) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `20${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `20${digits}`;
  return digits;
}

export type EgyptMobileValidation =
  | { valid: true; normalized: string; local: string }
  | { valid: false; reason: "empty" | "incomplete" | "invalid_prefix" | "date_like" };

/** Validate Egyptian mobile numbers (11 local digits: 01xxxxxxxxx). */
export function validateEgyptMobilePhone(value: string): EgyptMobileValidation {
  const raw = convertArabicDigitsToAscii(String(value ?? "")).trim();
  if (!raw) return { valid: false, reason: "empty" };

  const digits = stripPhoneFormatting(raw);
  if (looksLikeCalendarDateDigits(digits)) return { valid: false, reason: "date_like" };

  let local = digits;
  if (local.startsWith("20") && local.length >= 12) {
    local = `0${local.slice(2)}`;
  } else if (local.length === 10 && local.startsWith("1")) {
    local = `0${local}`;
  }

  if (local.length < 11) return { valid: false, reason: "incomplete" };
  if (local.length > 11) return { valid: false, reason: "invalid_prefix" };
  if (!/^01[0125]\d{8}$/.test(local)) return { valid: false, reason: "invalid_prefix" };

  return {
    valid: true,
    normalized: normalizeEgyptMobilePhone(local),
    local,
  };
}

export const INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR =
  "رقم الموبايل يبدو غير مكتمل. من فضلك اكتب رقم الموبايل المكوّن من 11 رقم.";

export function extractPhoneFromCustomerText(text: string): string | null {
  const normalizedText = convertArabicDigitsToAscii(text);
  const labeled =
    /(?:موبايل|جوال|تليفون|رقمي|رقم(?:\s*ال)?(?:موبايل|جوال|تليفون)?)\s*[:：]?\s*([+\d][\d\s\-().]{7,})/i.exec(
      normalizedText,
    );
  if (labeled?.[1]) {
    const candidate = stripPhoneFormatting(labeled[1]);
    if (!looksLikeCalendarDateDigits(candidate)) {
      const validated = validateEgyptMobilePhone(labeled[1]);
      if (validated.valid) return validated.normalized;
    }
  }

  const egyptMobile = normalizedText.match(/(?:\+?20)?0?1[0125][0-9٠-٩۰-۹]{7,9}/);
  if (egyptMobile) {
    const validated = validateEgyptMobilePhone(egyptMobile[0]);
    if (validated.valid) return validated.normalized;
  }

  const generic = normalizedText.match(/\b[\d٠-٩۰-۹]{8,15}\b/);
  if (generic) {
    const digits = stripPhoneFormatting(generic[0]);
    if (looksLikeCalendarDateDigits(digits)) return null;
    const validated = validateEgyptMobilePhone(generic[0]);
    if (validated.valid) return validated.normalized;
  }

  return null;
}

export function bookingPhonesDigitEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = stripPhoneFormatting(String(left ?? ""));
  const b = stripPhoneFormatting(String(right ?? ""));
  if (!a || !b) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 9) return false;
  return a.slice(-9) === b.slice(-9);
}
