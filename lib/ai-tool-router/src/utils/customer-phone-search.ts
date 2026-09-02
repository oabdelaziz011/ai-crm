/**
 * Phase D3 — Company-scoped customer phone search planning.
 *
 * Prefer canonical phone_e164 when safely resolvable.
 * Never invent region from company/locale.
 * Never use last-9 as primary identity.
 * Legacy ilike/exact phone terms remain a tenant-scoped fallback.
 */
import {
  resolvePhoneIdentity,
  createCompanyPhoneIdentityLookup,
  type PhoneIdentityInputSource,
} from "./phone-identity-resolver.js";
import {
  convertArabicDigitsToAscii,
  stripPhoneFormatting,
  validateEgyptMobilePhone,
} from "./customer-phone-normalization.js";

export type CustomerPhoneSearchPlan = {
  /** Canonical E.164 when safely resolved; null when unresolved/invalid. */
  phoneE164: string | null;
  /**
   * How identity was obtained for this search.
   * - phone_e164: safe international / explicit-region resolve
   * - legacy_fallback: unresolved — use existing tenant-scoped phone matching only
   */
  strategy: "phone_e164" | "legacy_fallback";
  reason?: string;
};

/**
 * True when the query is primarily phone-like (digits / +) rather than a name.
 * Name searches should not force phone resolution.
 */
export function queryLooksLikePhoneSearch(query: string): boolean {
  const raw = convertArabicDigitsToAscii(String(query ?? "")).trim();
  if (!raw) return false;
  // Reject pure alpha names.
  if (!/[0-9+]/.test(raw)) return false;
  const digits = stripPhoneFormatting(raw);
  if (digits.length >= 7) return true;
  if (raw.startsWith("+") && digits.length >= 3) return true;
  return false;
}

/**
 * Resolve a searchable phone input into a company-scoped E.164 plan.
 *
 * Resolution order (no country guess):
 * 1. resolvePhoneIdentity with optional explicit region / channel-style digits
 * 2. If still unresolved and Egypt mobile validates, resolve with region=EG (explicit)
 *    — only because the Egypt validator already confirmed the national form.
 * 3. Otherwise legacy_fallback (caller keeps existing tenant-scoped phone search).
 */
export function planCustomerPhoneSearch(input: {
  query: string;
  region?: string | null;
  source?: PhoneIdentityInputSource | null;
}): CustomerPhoneSearchPlan {
  const query = convertArabicDigitsToAscii(String(input.query ?? "")).trim();
  if (!query || !queryLooksLikePhoneSearch(query)) {
    return { phoneE164: null, strategy: "legacy_fallback", reason: "not_phone_query" };
  }

  const primary = resolvePhoneIdentity({
    phone: query,
    region: input.region,
    source: input.source ?? "explicit",
  });
  if (primary.status === "resolved") {
    return { phoneE164: primary.phoneE164, strategy: "phone_e164" };
  }

  // Safe EG bridge: only when Egypt mobile validation already accepts the input.
  // Does not use company country — uses the validated national number itself.
  if (!input.region) {
    const egypt = validateEgyptMobilePhone(query);
    if (egypt.valid) {
      const withEg = resolvePhoneIdentity({
        phone: egypt.local,
        region: "EG",
        source: "explicit",
      });
      if (withEg.status === "resolved") {
        return { phoneE164: withEg.phoneE164, strategy: "phone_e164" };
      }
    }
  }

  return {
    phoneE164: null,
    strategy: "legacy_fallback",
    reason: primary.status !== "resolved" ? primary.reason : "unresolved",
  };
}

/**
 * Build a company-scoped phone_e164 lookup key from a search plan.
 * Returns null when company or e164 is missing/invalid.
 */
export function companyScopedPhoneE164Lookup(input: {
  companyId: string | null | undefined;
  phoneE164: string | null | undefined;
}): { companyId: string; phoneE164: string } | null {
  const scoped = createCompanyPhoneIdentityLookup({
    companyId: input.companyId,
    phoneE164: input.phoneE164,
  });
  return scoped.ok ? scoped.lookup : null;
}
