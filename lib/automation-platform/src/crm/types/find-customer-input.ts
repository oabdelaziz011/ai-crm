import type { CustomerLookupField } from "../lookup/types.js";

export type CustomerRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** Canonical identity when loaded from DB (optional for older callers). */
  phoneE164?: string | null;
  age: number | null;
  /** ISO date `YYYY-MM-DD` when selected (migration 382). */
  dateOfBirth?: string | null;
  gender: string | null;
  /** Organization / employer name (migration 438). Not tenant company_id. */
  companyName?: string | null;
  notes: string | null;
  /** First-touch acquisition source (migration 382). */
  source?: string | null;
  /** CRM lifecycle status (migration 382). */
  status?: string | null;
  /** CRM-owned photo URL when selected. */
  avatarUrl?: string | null;
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
