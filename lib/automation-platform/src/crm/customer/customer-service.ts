import { ValidationError } from "../../errors.js";
import { CUSTOMER_LOOKUP_FIELDS, type CustomerLookupField } from "../lookup/types.js";
import type { CustomerRepositoryPort } from "./customer-repository-port.js";
import type { FindCustomerInput, FindCustomerResult } from "../types/find-customer-input.js";

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) throw new ValidationError(`Find customer requires ${label}.`);
  return normalized;
}

function readLookupBy(value: unknown): CustomerLookupField {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!CUSTOMER_LOOKUP_FIELDS.includes(normalized as CustomerLookupField)) {
    throw new ValidationError("Find customer lookup field is invalid.");
  }
  return normalized as CustomerLookupField;
}

export class CustomerService {
  constructor(private readonly repository: CustomerRepositoryPort) {}

  async findCustomer(input: FindCustomerInput): Promise<FindCustomerResult> {
    readRequiredString(input.companyId, "company");
    readRequiredString(input.userId, "owner");
    const lookupBy = readLookupBy(input.lookupBy);
    const lookupValue = readRequiredString(input.lookupValue, "lookup value");

    const { count, record } = await this.repository.findCustomersByField({ lookupBy, lookupValue });

    if (count === 0) {
      return { status: "not_found", count: 0 };
    }
    if (count === 1 && record) {
      return { status: "found", count: 1, customer: record };
    }
    return { status: "duplicate", count };
  }
}
