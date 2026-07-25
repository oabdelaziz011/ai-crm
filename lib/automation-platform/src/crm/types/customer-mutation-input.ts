import type { CustomerRecord } from "./find-customer-input.js";

export type CreateCustomerInput = {
  companyId: string;
  userId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  gender?: string | null;
  notes?: string | null;
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
};

export type UpdateCustomerResult = {
  customer: CustomerRecord;
};
