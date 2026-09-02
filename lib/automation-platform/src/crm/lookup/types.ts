export type LookupStatus = "found" | "not_found" | "duplicate";

export type LookupState = {
  status: LookupStatus;
  count: number;
};

export const CUSTOMER_LOOKUP_FIELDS = ["phone", "email", "customer_id", "phone_e164"] as const;
export type CustomerLookupField = (typeof CUSTOMER_LOOKUP_FIELDS)[number];
