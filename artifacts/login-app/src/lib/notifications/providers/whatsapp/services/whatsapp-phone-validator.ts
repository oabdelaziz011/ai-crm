import type {
  RecipientOptInStatus,
  RecipientPhoneValidation,
} from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function validateRecipientPhone(raw: string | null | undefined): RecipientPhoneValidation {
  if (!raw?.trim()) {
    return { valid: false, normalized: null, error: "missing_phone" };
  }

  const digits = raw.replace(/[^\d+]/g, "");
  let normalized = digits.startsWith("+") ? digits : `+${digits.replace(/^\+/, "")}`;

  if (!normalized.startsWith("+")) {
    normalized = `+${normalized}`;
  }

  if (!E164_PATTERN.test(normalized)) {
    return { valid: false, normalized: null, error: "invalid_mobile_format" };
  }

  const countryAndNational = normalized.slice(1);
  if (countryAndNational.length < 8) {
    return { valid: false, normalized: null, error: "missing_country_code" };
  }

  return { valid: true, normalized };
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
