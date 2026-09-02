import type { CustomerLookupField } from "../lookup/types.js";

export type CustomerRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Canonical identity when loaded from DB (optional for older callers). */
  phoneE164?: string | null;
  age: number | null;
  gender: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FindCustomerInput = {
  companyId: string;
  userId: string;
  lookupBy: CustomerLookupField;
  lookupValue: string;
};

export type FindCustomerResult =
  | { status: "found"; count: 1; customer: CustomerRecord }
  | { status: "not_found"; count: 0 }
  | { status: "duplicate"; count: number };
