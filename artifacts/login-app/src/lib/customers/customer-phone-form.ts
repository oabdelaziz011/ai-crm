/**
 * D5.2 — CRM phone form resolution / mutation helpers.
 * UI preview + validation only; persistence stays in use-customers / write ports.
 */
import {
  buildCustomerPhoneIdentityColumns,
  formatPhoneIdentityInternational,
  resolvePhoneIdentity,
  type CustomerPhoneIdentityColumns,
} from "@workspace/ai-tool-router";

export type CustomerPhoneFormValue = {
  phone: string | null;
  region: string | null;
  phoneE164: string | null;
  phoneCountryIso: string | null;
  phoneNational: string | null;
  regionSource: string | null;
};

export type CustomerPhoneValidationCode =
  | "ok"
  | "empty"
  | "phone_region_required"
  | "invalid_phone"
  | "phone_identity_unresolved";

export type CustomerPhoneValidation = {
  code: CustomerPhoneValidationCode;
  identity: CustomerPhoneIdentityColumns | null;
  preview: CustomerPhoneFormValue;
};

function emptyPreview(phone: string | null, region: string | null): CustomerPhoneFormValue {
  return {
    phone,
    region,
    phoneE164: null,
    phoneCountryIso: null,
    phoneNational: null,
    regionSource: null,
  };
}

/**
 * Resolve phone input for CRM create/change validation and live preview.
 * Never guesses country from company/locale.
 */
export function validateCustomerPhoneFormInput(input: {
  phone: string | null | undefined;
  region: string | null | undefined;
}): CustomerPhoneValidation {
  const phone = input.phone == null ? "" : String(input.phone).trim();
  const regionRaw = input.region == null ? "" : String(input.region).trim().toUpperCase();
  const region = regionRaw || null;

  if (!phone) {
    return {
      code: "empty",
      identity: buildCustomerPhoneIdentityColumns({ phone: null }),
      preview: emptyPreview(null, region),
    };
  }

  const resolved = resolvePhoneIdentity({
    phone,
    region,
    source: "explicit",
  });

  if (resolved.status !== "resolved") {
    if (resolved.reason === "missing_region") {
      return {
        code: "phone_region_required",
        identity: null,
        preview: emptyPreview(phone, region),
      };
    }
    return {
      code: "invalid_phone",
      identity: null,
      preview: emptyPreview(phone, region),
    };
  }

  const identity = buildCustomerPhoneIdentityColumns({
    phone,
    region,
    source: "explicit",
  });

  return {
    code: "ok",
    identity,
    preview: {
      phone,
      region: region ?? resolved.countryIso,
      phoneE164: resolved.phoneE164,
      phoneCountryIso: resolved.countryIso,
      phoneNational: resolved.phoneNational,
      regionSource: resolved.regionSource,
    },
  };
}

/** True when submitted phone/region differs from stored customer identity/legacy phone. */
export function didCustomerPhoneChange(input: {
  previousPhone: string | null | undefined;
  previousRegion: string | null | undefined;
  nextPhone: string | null | undefined;
  nextRegion: string | null | undefined;
}): boolean {
  const prevPhone = (input.previousPhone ?? "").trim();
  const nextPhone = (input.nextPhone ?? "").trim();
  const prevRegion = (input.previousRegion ?? "").trim().toUpperCase();
  const nextRegion = (input.nextRegion ?? "").trim().toUpperCase();
  return prevPhone !== nextPhone || prevRegion !== nextRegion;
}

/**
 * Prefer stored identity for display. Do not Egypt-guess legacy locals.
 * Uses formatPhoneIdentityInternational on stored E.164 only — not a second normalizer.
 */
export function formatCustomerPhoneDisplay(customer: {
  phone?: string | null;
  phone_e164?: string | null;
  phone_national?: string | null;
  phone_country_iso?: string | null;
}): { primary: string; countryIso: string | null } {
  const e164 = customer.phone_e164?.trim() || null;
  const legacy = customer.phone?.trim() || null;
  const iso = customer.phone_country_iso?.trim()?.toUpperCase() || null;

  if (e164) {
    return {
      primary: formatPhoneIdentityInternational(e164) ?? e164,
      countryIso: iso,
    };
  }
  if (legacy) {
    return { primary: legacy, countryIso: iso };
  }
  return { primary: "", countryIso: null };
}

export function localizedCountryName(iso: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "region" }).of(iso.toUpperCase());
    return name ?? iso.toUpperCase();
  } catch {
    return iso.toUpperCase();
  }
}

export function countryFlagEmoji(iso: string): string {
  const code = iso.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0)));
}
