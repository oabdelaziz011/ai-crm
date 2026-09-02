import type { CustomerRecord } from "./find-customer-input.js";

/** Additive phone identity columns (migration 332). Structural match for dual-write. */
export type CustomerPhoneIdentityWrite = {
  phone_e164: string | null;
  phone_country_iso: string | null;
  phone_region_source: "explicit" | "e164" | "channel" | "import" | "unresolved" | null;
  phone_national: string | null;
};

export type CreateCustomerInput = {
  companyId: string;
  userId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  notes?: string | null;
  /** Precomputed dual-write identity; when omitted, unresolved/cleared defaults apply. */
  phoneIdentity?: CustomerPhoneIdentityWrite | null;
};

export type CreateCustomerResult = {
  customer: CustomerRecord;
};

export type UpdateCustomerInput = {
  companyId: string;
  userId: string;
  customerId: string;
  field: string;
  value: string;
  /** Required for correct dual-write when field === "phone"; otherwise unresolved/cleared. */
  phoneIdentity?: CustomerPhoneIdentityWrite | null;
};

export type UpdateCustomerResult = {
  customer: CustomerRecord;
};
