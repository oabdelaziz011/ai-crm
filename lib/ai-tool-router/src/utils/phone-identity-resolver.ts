/**
 * Phase 2H.13 / Phase B — Global phone identity resolver.
 *
 * Single reusable foundation for CRM / portal / AI / imports / channels /
 * notifications / campaigns / future SMS & Voice.
 *
 * Pure / local: no DB, network, Meta, or Supabase calls.
 * Does NOT guess region from company country, browser locale, timezone, or language.
 * Does NOT use trailing-digit suffix matching as identity.
 *
 * Existing Egypt helpers in customer-phone-normalization.ts remain for compatibility.
 */
import {
  parsePhoneNumberFromString,
  type CountryCode,
  type NumberType,
} from "libphonenumber-js/max";
import { convertArabicDigitsToAscii } from "./customer-phone-normalization.js";

/** Matches migration 332 `customers.phone_region_source` allowlist. */
export type PhoneRegionSource =
  | "explicit"
  | "e164"
  | "channel"
  | "import"
  | "unresolved";

export type PhoneIdentityStatus = "resolved" | "unresolved" | "invalid" | "ambiguous";

export type PhoneNumberTypeLabel = "MOBILE" | "FIXED_LINE" | "VOIP" | "UNKNOWN";

export type PhoneIdentityReason =
  | "empty"
  | "extension_not_supported"
  | "missing_region"
  | "invalid_region"
  | "invalid_number"
  | "not_possible"
  | "ambiguous"
  | "malformed_plus"
  | "too_short"
  | "too_long"
  | "company_country_forbidden"
  | "browser_locale_forbidden"
  | "suffix_identity_forbidden";

/**
 * Caller-declared origin of the phone / region hint.
 * Never includes company / branch / browser / timezone / locale.
 */
export type PhoneIdentityInputSource = "explicit" | "channel" | "import";

export type ResolvePhoneIdentityInput = {
  phone: string | null | undefined;
  /** ISO-3166-1 alpha-2 when the number is national/local. Required for local numbers. */
  region?: string | null;
  source?: PhoneIdentityInputSource | null;
};

export type ResolvedPhoneIdentity = {
  status: "resolved";
  phoneE164: string;
  phoneNational: string;
  countryIso: CountryCode;
  regionSource: Exclude<PhoneRegionSource, "unresolved">;
  numberType: PhoneNumberTypeLabel;
};

export type UnresolvedPhoneIdentity = {
  status: Exclude<PhoneIdentityStatus, "resolved">;
  phoneE164?: undefined;
  phoneNational?: undefined;
  countryIso?: undefined;
  regionSource: "unresolved";
  numberType?: undefined;
  reason: PhoneIdentityReason;
};

export type PhoneIdentityResult = ResolvedPhoneIdentity | UnresolvedPhoneIdentity;

/** Company-scoped identity key — never E.164 alone. */
export type CompanyPhoneIdentityLookup = {
  companyId: string;
  phoneE164: string;
};

const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const REGION_PATTERN = /^[A-Z]{2}$/;

/** Extension markers — fail closed; never silently fold into the national number. */
const EXTENSION_PATTERN =
  /(?:\bext\.?\s*\d|\bextension\b\s*\d|;ext=\s*\d|\d[x#]\d|[x#]\d+)/i;

/** Reject accidental API misuse that would invent a region from tenant/locale context. */
const FORBIDDEN_REGION_KEYS = [
  "companyCountry",
  "company_country",
  "branchCountry",
  "branch_country",
  "browserLocale",
  "browser_locale",
  "locale",
  "timezone",
  "customerLanguage",
  "customer_language",
] as const;

function unresolved(
  reason: PhoneIdentityReason,
  status?: Exclude<PhoneIdentityStatus, "resolved">,
): UnresolvedPhoneIdentity {
  const resolvedStatus =
    status ??
    (reason === "ambiguous"
      ? "ambiguous"
      : reason === "empty" ||
          reason === "missing_region" ||
          reason === "company_country_forbidden" ||
          reason === "browser_locale_forbidden" ||
          reason === "suffix_identity_forbidden"
        ? "unresolved"
        : "invalid");
  return { status: resolvedStatus, regionSource: "unresolved", reason };
}

function mapNumberType(type: NumberType | undefined): PhoneNumberTypeLabel {
  switch (type) {
    case "MOBILE":
      return "MOBILE";
    case "FIXED_LINE":
      return "FIXED_LINE";
    case "VOIP":
      return "VOIP";
    default:
      return "UNKNOWN";
  }
}

function normalizeRegion(region: string | null | undefined): CountryCode | null | "invalid" {
  if (region == null || !String(region).trim()) return null;
  const iso = String(region).trim().toUpperCase();
  if (!REGION_PATTERN.test(iso)) return "invalid";
  return iso as CountryCode;
}

/**
 * Cleanup: Arabic digits → ASCII; drop spaces/hyphens/parentheses/formatting.
 * Preserves a single leading '+' when present.
 */
export function sanitizePhoneIdentityInput(raw: string): {
  ok: true;
  cleaned: string;
  hadPlus: boolean;
} | {
  ok: false;
  reason: PhoneIdentityReason;
} {
  const ascii = convertArabicDigitsToAscii(String(raw ?? "")).trim();
  if (!ascii) return { ok: false, reason: "empty" };

  if (EXTENSION_PATTERN.test(ascii)) {
    return { ok: false, reason: "extension_not_supported" };
  }

  // Reject multiple '+' or '+' not at start after stripping spaces
  const compact = ascii.replace(/[\s\-().]/g, "");
  if (compact.includes("+") && !compact.startsWith("+")) {
    return { ok: false, reason: "malformed_plus" };
  }
  if ((compact.match(/\+/g) ?? []).length > 1) {
    return { ok: false, reason: "malformed_plus" };
  }

  let digitsAndPlus = compact.replace(/[^\d+]/g, "");
  if (!digitsAndPlus || digitsAndPlus === "+") {
    return { ok: false, reason: "empty" };
  }

  // ITU international access prefix "00" → "+" (not a country guess; no default region).
  let hadPlus = digitsAndPlus.startsWith("+");
  if (!hadPlus && digitsAndPlus.startsWith("00") && digitsAndPlus.length > 2) {
    digitsAndPlus = `+${digitsAndPlus.slice(2)}`;
    hadPlus = true;
  }

  const digitCount = digitsAndPlus.replace(/\D/g, "").length;
  if (digitCount < 3) return { ok: false, reason: "too_short" };
  if (digitCount > 15) return { ok: false, reason: "too_long" };

  return { ok: true, cleaned: digitsAndPlus, hadPlus };
}

function deriveRegionSource(params: {
  hadPlus: boolean;
  usedDefaultCountry: boolean;
  inputSource: PhoneIdentityInputSource | null | undefined;
}): Exclude<PhoneRegionSource, "unresolved"> {
  if (params.hadPlus) return "e164";
  if (!params.usedDefaultCountry) {
    // Country-coded digits without '+' (e.g. Meta `from`) parsed as international.
    return params.inputSource === "channel" ? "channel" : "e164";
  }
  if (params.inputSource === "import") return "import";
  return "explicit";
}

/**
 * Resolve a phone into canonical identity fields.
 * Local/national numbers require an explicit `region` (ISO-2).
 * Channel country-coded digit strings (no '+') are parsed as international when valid.
 */
export function resolvePhoneIdentity(input: ResolvePhoneIdentityInput): PhoneIdentityResult {
  // Guard against misuse: forbidden fallback keys must never influence resolution.
  const bag = input as ResolvePhoneIdentityInput & Record<string, unknown>;
  for (const key of FORBIDDEN_REGION_KEYS) {
    if (bag[key] != null && String(bag[key]).trim() !== "") {
      return unresolved(
        key.toLowerCase().includes("locale") || key === "locale"
          ? "browser_locale_forbidden"
          : key.toLowerCase().includes("company") || key.toLowerCase().includes("branch")
            ? "company_country_forbidden"
            : "browser_locale_forbidden",
      );
    }
  }

  if (input.phone == null || !String(input.phone).trim()) {
    return unresolved("empty");
  }

  const sanitized = sanitizePhoneIdentityInput(String(input.phone));
  if (!sanitized.ok) {
    return unresolved(sanitized.reason);
  }

  const regionNorm = normalizeRegion(input.region);
  if (regionNorm === "invalid") {
    return unresolved("invalid_region");
  }

  const { cleaned, hadPlus } = sanitized;

  let parseText = cleaned;
  let defaultCountry: CountryCode | undefined;
  let usedDefaultCountry = false;

  if (hadPlus) {
    parseText = cleaned;
  } else if (regionNorm) {
    parseText = cleaned;
    defaultCountry = regionNorm;
    usedDefaultCountry = true;
  } else {
    // No region: only accept complete international (country-coded) digit strings.
    parseText = `+${cleaned}`;
  }

  const parsed = parsePhoneNumberFromString(
    parseText,
    defaultCountry ? { defaultCountry, extract: false } : { extract: false },
  );

  if (!parsed) {
    if (!hadPlus && !regionNorm) return unresolved("missing_region");
    return unresolved("invalid_number");
  }

  if (parsed.ext) {
    return unresolved("extension_not_supported");
  }

  if (!parsed.isPossible()) {
    if (!hadPlus && !regionNorm) return unresolved("missing_region");
    return unresolved("not_possible");
  }

  if (!parsed.isValid()) {
    if (!hadPlus && !regionNorm) return unresolved("missing_region");
    return unresolved("invalid_number");
  }

  const phoneE164 = parsed.format("E.164");
  if (!E164_PATTERN.test(phoneE164)) {
    return unresolved("invalid_number");
  }

  const countryIso = parsed.country;
  if (!countryIso) {
    return unresolved("ambiguous");
  }

  const regionSource = deriveRegionSource({
    hadPlus,
    usedDefaultCountry,
    inputSource: input.source,
  });

  return {
    status: "resolved",
    phoneE164,
    phoneNational: parsed.formatNational(),
    countryIso,
    regionSource,
    numberType: mapNumberType(parsed.getType()),
  };
}

/**
 * Build a company-scoped phone identity lookup key.
 * Requires both companyId and phoneE164 — never global E.164 lookup.
 */
export function createCompanyPhoneIdentityLookup(params: {
  companyId: string | null | undefined;
  phoneE164: string | null | undefined;
}):
  | { ok: true; lookup: CompanyPhoneIdentityLookup }
  | { ok: false; reason: "company_id_required" | "phone_e164_required" | "invalid_phone_e164" } {
  const companyId = String(params.companyId ?? "").trim();
  const phoneE164 = String(params.phoneE164 ?? "").trim();
  if (!companyId) return { ok: false, reason: "company_id_required" };
  if (!phoneE164) return { ok: false, reason: "phone_e164_required" };
  if (!E164_PATTERN.test(phoneE164)) return { ok: false, reason: "invalid_phone_e164" };
  return { ok: true, lookup: { companyId, phoneE164 } };
}

/** Two lookups match only when both company and E.164 match. */
export function companyPhoneIdentitiesEqual(
  left: CompanyPhoneIdentityLookup,
  right: CompanyPhoneIdentityLookup,
): boolean {
  return left.companyId === right.companyId && left.phoneE164 === right.phoneE164;
}

/**
 * Explicitly documents that last-9 is not an identity strategy for this resolver.
 * Always returns false — callers must not use last-9 as equality.
 */
export function phoneIdentityUsesLastNine(): false {
  return false;
}

/** UI-only international display for a stored E.164 (no DB writes). */
export function formatPhoneIdentityInternational(phoneE164: string | null | undefined): string | null {
  const raw = String(phoneE164 ?? "").trim();
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw, { extract: false });
  if (!parsed) return raw.startsWith("+") ? raw : null;
  return parsed.formatInternational();
}
