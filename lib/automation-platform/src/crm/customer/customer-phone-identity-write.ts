/**
 * Default / boundary phone identity for customer writes.
 * D5.4 Gap 2 — omitted phoneIdentity must go through canonical resolvePhoneIdentity.
 * Never invents country from company/locale.
 */
import {
  buildCustomerPhoneIdentityColumns,
  isImportPhoneWritable,
  resolveImportPhoneIdentity,
} from "@workspace/ai-tool-router";
import type { CustomerPhoneIdentityWrite } from "../types/customer-mutation-input.js";

const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const ISO2_PATTERN = /^[A-Z]{2}$/;
const REGION_SOURCES = new Set([
  "explicit",
  "e164",
  "channel",
  "import",
  "unresolved",
]);

export class CustomerPhoneIdentityWriteError extends Error {
  readonly code:
    | "phone_region_required"
    | "invalid_phone"
    | "invalid_phone_identity";

  constructor(code: CustomerPhoneIdentityWriteError["code"], message: string) {
    super(message);
    this.name = "CustomerPhoneIdentityWriteError";
    this.code = code;
  }
}

function validateProvidedIdentity(
  identity: CustomerPhoneIdentityWrite,
): CustomerPhoneIdentityWrite {
  const e164 = identity.phone_e164 == null ? null : String(identity.phone_e164).trim() || null;
  const iso =
    identity.phone_country_iso == null
      ? null
      : String(identity.phone_country_iso).trim().toUpperCase() || null;
  const source =
    identity.phone_region_source == null
      ? null
      : (String(identity.phone_region_source).trim() as CustomerPhoneIdentityWrite["phone_region_source"]);
  const national =
    identity.phone_national == null ? null : String(identity.phone_national).trim() || null;

  if (e164 && !E164_PATTERN.test(e164)) {
    throw new CustomerPhoneIdentityWriteError(
      "invalid_phone_identity",
      "INVALID_PHONE_IDENTITY: phone_e164 format is invalid.",
    );
  }
  if (iso && !ISO2_PATTERN.test(iso)) {
    throw new CustomerPhoneIdentityWriteError(
      "invalid_phone_identity",
      "INVALID_PHONE_IDENTITY: phone_country_iso must be ISO-2.",
    );
  }
  if (source && !REGION_SOURCES.has(source)) {
    throw new CustomerPhoneIdentityWriteError(
      "invalid_phone_identity",
      "INVALID_PHONE_IDENTITY: phone_region_source is invalid.",
    );
  }

  return {
    phone_e164: e164,
    phone_country_iso: iso,
    phone_region_source: source,
    phone_national: national,
  };
}

/**
 * Resolve identity columns for create/update phone writes.
 *
 * 1. Explicit phoneIdentity → validate + persist
 * 2. Omitted → derive via canonical resolver (no region invent)
 * 3. Local without region → fail closed
 * 4. Empty phone → clear identity
 */
export function resolvePhoneIdentityWrite(
  phone: string | null | undefined,
  provided?: CustomerPhoneIdentityWrite | null,
  options?: { region?: string | null; source?: "explicit" | "import" | "channel" },
): CustomerPhoneIdentityWrite {
  if (provided) {
    return validateProvidedIdentity(provided);
  }

  const preview = resolveImportPhoneIdentity({
    phone,
    rowRegion: options?.region ?? null,
    source: options?.source ?? "explicit",
  });

  if (!phone || !String(phone).trim()) {
    return buildCustomerPhoneIdentityColumns({ phone: null });
  }

  if (!isImportPhoneWritable(preview) || !preview.identity) {
    if (preview.code === "phone_region_required") {
      throw new CustomerPhoneIdentityWriteError(
        "phone_region_required",
        "PHONE_REGION_REQUIRED: Provide an ISO-2 region for local phone numbers, or use E.164 (+...).",
      );
    }
    throw new CustomerPhoneIdentityWriteError(
      "invalid_phone",
      "INVALID_PHONE: Phone number could not be resolved.",
    );
  }

  return preview.identity;
}

/** @deprecated Prefer resolvePhoneIdentityWrite — kept for seed helpers that clear empty phones. */
export function defaultCustomerPhoneIdentityWrite(
  phone: string | null | undefined,
): CustomerPhoneIdentityWrite {
  return resolvePhoneIdentityWrite(phone, null);
}
