import type {
  RecipientOptInStatus,
  RecipientPhoneValidation,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/**
 * Syntactic E.164 gate for Meta `to`.
 * Requires a leading '+'. Does not guess country or prepend '+' to local nationals.
 * Callers must resolve identity first (resolveWhatsAppOutboundPhone / resolvePhoneIdentity).
 */
export function validateRecipientPhone(raw: string | null | undefined): RecipientPhoneValidation {
  if (!raw?.trim()) {
    return { valid: false, normalized: null, error: "missing_phone" };
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith("+")) {
    return { valid: false, normalized: null, error: "invalid_phone_identity" };
  }

  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+") || (digits.match(/\+/g) ?? []).length !== 1) {
    return { valid: false, normalized: null, error: "invalid_phone_identity" };
  }

  if (!E164_PATTERN.test(digits)) {
    return { valid: false, normalized: null, error: "invalid_mobile_format" };
  }

  const countryAndNational = digits.slice(1);
  if (countryAndNational.length < 8) {
    return { valid: false, normalized: null, error: "missing_country_code" };
  }

  return { valid: true, normalized: digits };
}

/** Future-ready opt-in gate — defaults to allowed until preference storage exists. */
export function checkWhatsAppOptIn(params: Record<string, string>): RecipientOptInStatus {
  const explicit =
    params.whatsappOptIn ??
    params.whatsapp_opt_in ??
    params.optIn ??
    params.opt_in;

  if (explicit === "false" || explicit === "0") {
    return { optedIn: false, reason: "explicit_opt_out" };
  }

  return { optedIn: true };
}
