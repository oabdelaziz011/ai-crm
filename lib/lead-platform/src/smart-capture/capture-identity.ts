/**
 * Company-scoped identity helpers for Smart Capture.
 * Kept inside lead-platform to avoid importing ai-tool-router / automation-platform.
 */

const CLOSED_LIFECYCLES = new Set([
  "converted",
  "won",
  "lost",
  "disqualified",
  "archived",
  "closed",
  "purchased",
]);

/** WhatsApp / Messenger "About" status lines often land in contactName — not a person. */
export function isContactStatusSlogan(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  if (/^هنا\s*للمساعدة$/iu.test(n)) return true;
  if (/^hey there[!.,]?\s*i('|\u2019)?m\s+using\s+whatsapp\.?$/i.test(n)) return true;
  if (/^مرحبا[!!.؟]?\s*أستخدم\s*واتساب/iu.test(n)) return true;
  if (/^(available|busy|at work|sleeping|only urgent calls)$/i.test(n)) return true;
  if (/^(متاح|مشغول|في العمل|نائم|للمساعدة فقط)$/iu.test(n)) return true;
  return false;
}

/** Channel-generated or empty labels are not real person names. */
export function isPlaceholderContactName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  if (/^unknown(\s+contact)?$/i.test(n)) return true;
  if (/^(whatsapp|messenger|instagram|sms|web\s*chat)\b/i.test(n)) return true;
  if (isContactStatusSlogan(n)) return true;
  const digits = n.replace(/[\s\-()]/g, "");
  if (/^\+?\d{8,15}$/.test(digits)) return true;
  return false;
}

/** Digits only; preserves leading country code when present. */
export function normalizeCapturePhoneDigits(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const arabic = raw.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const digits = arabic.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Lookup variants for lead.phone / identityKeys without using last-10 as sole identity.
 * Prefer exact and Egyptian local ↔ international bridges.
 */
export function buildCapturePhoneLookupVariants(value: string | null | undefined): string[] {
  const digits = normalizeCapturePhoneDigits(value);
  if (!digits) return [];
  const out = new Set<string>();
  out.add(digits);
  out.add(`+${digits}`);

  // Egypt mobile: 01xxxxxxxxx ↔ 201xxxxxxxxx ↔ +201xxxxxxxxx
  if (/^01[0125]\d{8}$/.test(digits)) {
    out.add(`20${digits.slice(1)}`);
    out.add(`+20${digits.slice(1)}`);
    out.add(digits);
  }
  if (/^201[0125]\d{8}$/.test(digits)) {
    out.add(`0${digits.slice(2)}`);
    out.add(`+${digits}`);
    out.add(digits);
  }
  if (/^20\d{10}$/.test(digits) && !/^201[0125]/.test(digits)) {
    out.add(`+${digits}`);
  }

  return [...out];
}

export function isOpenLeadLifecycle(lifecycleStatus: string | null | undefined): boolean {
  const status = String(lifecycleStatus ?? "").trim().toLowerCase();
  if (!status) return true;
  return !CLOSED_LIFECYCLES.has(status);
}

/**
 * Store channel phones as +E.164. Meta WhatsApp `from` is country-code digits without +.
 * Egypt national 01… is bridged to +20…; other leading-0 nationals fail closed (no country guess).
 */
export function toChannelInternationalPhone(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const digits = normalizeCapturePhoneDigits(raw);
  if (!digits) return null;
  if (raw.startsWith("+")) return `+${digits}`;
  if (/^01[0125]\d{8}$/.test(digits)) return `+20${digits.slice(1)}`;
  if (digits.startsWith("0")) return null;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Prefer WhatsApp / SMS sender id as phone when explicit phone is missing. Always +E.164 when resolved. */
export function deriveCapturePhone(input: {
  channelType: string;
  phone?: string | null;
  externalUserId?: string | null;
}): string | null {
  const channel = input.channelType.trim().toLowerCase();
  const explicit = input.phone?.trim() || null;
  if (explicit) {
    const intl = toChannelInternationalPhone(explicit);
    if (intl) return intl;
  }
  if (channel === "whatsapp" || channel === "sms") {
    return toChannelInternationalPhone(input.externalUserId);
  }
  return null;
}
