/**
 * Phase 2H.14 / Phase C — Customer phone identity dual-write helpers.
 *
 * Builds additive identity columns from resolvePhoneIdentity().
 * Never rewrites the legacy `phone` value.
 * Never guesses region from company/locale/timezone.
 */
import {
  resolvePhoneIdentity,
  type PhoneIdentityInputSource,
  type PhoneRegionSource,
} from "./phone-identity-resolver.js";

/** DB column payload for public.customers identity fields (migration 332). */
export type CustomerPhoneIdentityColumns = {
  phone_e164: string | null;
  phone_country_iso: string | null;
  phone_region_source: PhoneRegionSource | null;
  phone_national: string | null;
};

export type BuildCustomerPhoneIdentityInput = {
  /** Legacy/raw phone string that will be stored in customers.phone (unchanged). */
  phone: string | null | undefined;
  region?: string | null;
  source?: PhoneIdentityInputSource | null;
};

/**
 * Clear identity when phone is empty.
 * Schema allows NULL region_source; use null (not "unresolved") when phone is cleared
 * so we do not imply a failed resolution of an empty value.
 */
export function clearedCustomerPhoneIdentityColumns(): CustomerPhoneIdentityColumns {
  return {
    phone_e164: null,
    phone_country_iso: null,
    phone_region_source: null,
    phone_national: null,
  };
}

/**
 * Unresolved / invalid: keep legacy phone writable; do not invent country.
 * phone_region_source = unresolved per Phase C contract.
 */
export function unresolvedCustomerPhoneIdentityColumns(): CustomerPhoneIdentityColumns {
  return {
    phone_e164: null,
    phone_country_iso: null,
    phone_region_source: "unresolved",
    phone_national: null,
  };
}

/**
 * Resolve identity columns for dual-write.
 * Legacy `phone` is NOT returned and must be written separately as provided by the caller.
 */
export function buildCustomerPhoneIdentityColumns(
  input: BuildCustomerPhoneIdentityInput,
): CustomerPhoneIdentityColumns {
  const raw = input.phone == null ? "" : String(input.phone).trim();
  if (!raw) {
    return clearedCustomerPhoneIdentityColumns();
  }

  const resolved = resolvePhoneIdentity({
    phone: raw,
    region: input.region,
    source: input.source,
  });

  if (resolved.status !== "resolved") {
    return unresolvedCustomerPhoneIdentityColumns();
  }

  return {
    phone_e164: resolved.phoneE164,
    phone_country_iso: resolved.countryIso,
    phone_region_source: resolved.regionSource,
    phone_national: resolved.phoneNational,
  };
}

/**
 * Convenience: merge identity onto a row patch without touching `phone`.
 */
export function withCustomerPhoneIdentityDualWrite<T extends Record<string, unknown>>(
  row: T,
  input: BuildCustomerPhoneIdentityInput,
): T & CustomerPhoneIdentityColumns {
  return {
    ...row,
    ...buildCustomerPhoneIdentityColumns(input),
  };
}
