/**
 * D5.3 — Shared import / non-UI customer phone identity resolution.
 *
 * Region precedence (never company/locale/timezone):
 *   1. Explicit per-row ISO-2
 *   2. Explicit import/operator default ISO-2
 *   3. E.164 / international self-identification
 *   4. unresolved / invalid / ambiguous (fail closed — no guess)
 *
 * Pure / local: no DB, Meta, queue, or campaign side effects.
 */
import {
  resolvePhoneIdentity,
  type PhoneNumberTypeLabel,
  type PhoneRegionSource,
} from "./phone-identity-resolver.js";
import {
  buildCustomerPhoneIdentityColumns,
  type CustomerPhoneIdentityColumns,
} from "./customer-phone-identity-dual-write.js";

export type ImportPhoneIdentityStatus =
  | "empty"
  | "resolved"
  | "unresolved"
  | "invalid"
  | "ambiguous"
  | "phone_region_required";

export type ImportPhoneIdentityCode =
  | "ok"
  | "empty"
  | "phone_region_required"
  | "invalid_phone"
  | "ambiguous_phone"
  | "phone_identity_unresolved";

export type ImportPhoneIdentityPreview = {
  status: ImportPhoneIdentityStatus;
  code: ImportPhoneIdentityCode;
  phone: string | null;
  regionUsed: string | null;
  phoneE164: string | null;
  phoneCountryIso: string | null;
  phoneNational: string | null;
  phoneRegionSource: PhoneRegionSource | null;
  numberType: PhoneNumberTypeLabel | null;
  identity: CustomerPhoneIdentityColumns | null;
};

function normalizeIso2(region: string | null | undefined): string | null {
  if (region == null) return null;
  const iso = String(region).trim().toUpperCase();
  if (!iso) return null;
  if (!/^[A-Z]{2}$/.test(iso)) return null;
  return iso;
}

/**
 * Resolve effective region for an import/create row.
 * Row region wins over import default. Never invents company country.
 */
export function resolveImportPhoneRegion(input: {
  rowRegion?: string | null;
  defaultRegion?: string | null;
}): string | null {
  return normalizeIso2(input.rowRegion) ?? normalizeIso2(input.defaultRegion);
}

/**
 * Resolve phone identity for import / automation / application-layer writes.
 */
export function resolveImportPhoneIdentity(input: {
  phone: string | null | undefined;
  rowRegion?: string | null;
  defaultRegion?: string | null;
  /** Defaults to "import". Use "explicit" for automation/app-layer. */
  source?: "import" | "explicit" | "channel";
}): ImportPhoneIdentityPreview {
  const phone = input.phone == null ? "" : String(input.phone).trim();
  const region = resolveImportPhoneRegion({
    rowRegion: input.rowRegion,
    defaultRegion: input.defaultRegion,
  });
  const source = input.source ?? "import";

  if (!phone) {
    return {
      status: "empty",
      code: "empty",
      phone: null,
      regionUsed: region,
      phoneE164: null,
      phoneCountryIso: null,
      phoneNational: null,
      phoneRegionSource: null,
      numberType: null,
      identity: buildCustomerPhoneIdentityColumns({ phone: null }),
    };
  }

  const resolved = resolvePhoneIdentity({
    phone,
    region,
    source: source === "channel" ? "channel" : source === "import" ? "import" : "explicit",
  });

  if (resolved.status === "resolved") {
    const identity = buildCustomerPhoneIdentityColumns({
      phone,
      region,
      source: source === "channel" ? "channel" : source === "import" ? "import" : "explicit",
    });
    return {
      status: "resolved",
      code: "ok",
      phone,
      regionUsed: region ?? resolved.countryIso,
      phoneE164: resolved.phoneE164,
      phoneCountryIso: resolved.countryIso,
      phoneNational: resolved.phoneNational,
      phoneRegionSource: resolved.regionSource,
      numberType: resolved.numberType,
      identity,
    };
  }

  if (resolved.reason === "missing_region") {
    return {
      status: "phone_region_required",
      code: "phone_region_required",
      phone,
      regionUsed: region,
      phoneE164: null,
      phoneCountryIso: null,
      phoneNational: null,
      phoneRegionSource: null,
      numberType: null,
      identity: null,
    };
  }

  if (resolved.status === "ambiguous" || resolved.reason === "ambiguous") {
    return {
      status: "ambiguous",
      code: "ambiguous_phone",
      phone,
      regionUsed: region,
      phoneE164: null,
      phoneCountryIso: null,
      phoneNational: null,
      phoneRegionSource: null,
      numberType: null,
      identity: null,
    };
  }

  if (resolved.status === "unresolved") {
    return {
      status: "unresolved",
      code: "phone_identity_unresolved",
      phone,
      regionUsed: region,
      phoneE164: null,
      phoneCountryIso: null,
      phoneNational: null,
      phoneRegionSource: null,
      numberType: null,
      identity: null,
    };
  }

  return {
    status: "invalid",
    code: "invalid_phone",
    phone,
    regionUsed: region,
    phoneE164: null,
    phoneCountryIso: null,
    phoneNational: null,
    phoneRegionSource: null,
    numberType: null,
    identity: null,
  };
}

/**
 * True when a phone-bearing write may proceed (empty phone allowed; locals without region blocked).
 */
export function isImportPhoneWritable(preview: ImportPhoneIdentityPreview): boolean {
  return preview.code === "ok" || preview.code === "empty";
}

export type ImportCustomerRowPreview = {
  index: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  phoneStatus: ImportPhoneIdentityStatus;
  phoneCode: ImportPhoneIdentityCode;
  phoneE164: string | null;
  phoneCountryIso: string | null;
  phoneNational: string | null;
  phoneRegionSource: PhoneRegionSource | null;
  numberType: PhoneNumberTypeLabel | null;
  /** When phone is present and not writable, row must not be imported as resolved. */
  writable: boolean;
};

/**
 * Dry-run preview for import rows. No DB writes.
 */
export function previewImportCustomerPhoneRows(input: {
  rows: Array<{
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    region?: string | null;
    country?: string | null;
    phone_country_iso?: string | null;
  }>;
  defaultRegion?: string | null;
}): ImportCustomerRowPreview[] {
  return input.rows.map((row, index) => {
    const name = row.name == null ? null : String(row.name).trim() || null;
    const phone = row.phone == null ? null : String(row.phone).trim() || null;
    const email = row.email == null ? null : String(row.email).trim() || null;
    const rowRegion = row.region ?? row.country ?? row.phone_country_iso ?? null;
    const preview = resolveImportPhoneIdentity({
      phone,
      rowRegion,
      defaultRegion: input.defaultRegion,
      source: "import",
    });
    const writable = Boolean(name) && isImportPhoneWritable(preview);
    return {
      index,
      name,
      phone,
      email,
      region: preview.regionUsed,
      phoneStatus: preview.status,
      phoneCode: preview.code,
      phoneE164: preview.phoneE164,
      phoneCountryIso: preview.phoneCountryIso,
      phoneNational: preview.phoneNational,
      phoneRegionSource: preview.phoneRegionSource,
      numberType: preview.numberType,
      writable,
    };
  });
}
