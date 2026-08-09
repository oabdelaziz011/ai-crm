import { ValidationError } from "../../errors.js";
import { CUSTOMER_LOOKUP_FIELDS, type CustomerLookupField } from "../lookup/types.js";
import type { CustomerRepositoryPort } from "./customer-repository-port.js";
import type { FindCustomerInput, FindCustomerResult, CustomerRecord } from "../types/find-customer-input.js";
import type { CreateCustomerInput, CreateCustomerResult, UpdateCustomerInput, UpdateCustomerResult } from "../types/customer-mutation-input.js";
import {
  formatAmbiguousCustomerEmailMessage,
  normalizeCustomerEmail,
  toCustomerMutationError,
} from "./customer-email-utils.js";

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

    const { count, record } = await this.repository.findCustomersByField({
      companyId: input.companyId,
      lookupBy,
      lookupValue,
    });

    if (count === 0) {
      return { status: "not_found", count: 0 };
    }
    if (count === 1 && record) {
      return { status: "found", count: 1, customer: record };
    }
    return { status: "duplicate", count };
  }

  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    readRequiredString(input.companyId, "company");
    readRequiredString(input.userId, "owner");
    const name = readRequiredString(input.name, "name");
    try {
      const customer = await this.repository.createCustomer({
        ...input,
        name,
        email: normalizeCustomerEmail(input.email) ?? input.email,
      });
      return { customer };
    } catch (error) {
      throw toCustomerMutationError(error);
    }
  }

  /**
   * Lead conversion — reuse an existing customer by normalized email when possible.
   */
  async resolveCustomerForLeadConversion(
    input: CreateCustomerInput,
  ): Promise<{ customer: CustomerRecord; created: boolean }> {
    readRequiredString(input.companyId, "company");
    readRequiredString(input.userId, "owner");
    const name = readRequiredString(input.name, "name");
    const normalizedEmail = normalizeCustomerEmail(input.email);

    if (normalizedEmail) {
      const lookup = await this.findCustomer({
        companyId: input.companyId,
        userId: input.userId,
        lookupBy: "email",
        lookupValue: normalizedEmail,
      });
      if (lookup.status === "found" && lookup.customer) {
        return { customer: lookup.customer, created: false };
      }
      if (lookup.status === "duplicate") {
        throw new ValidationError(formatAmbiguousCustomerEmailMessage());
      }
    }

    const created = await this.createCustomer({
      ...input,
      name,
      email: normalizedEmail ?? input.email,
    });
    return { customer: created.customer, created: true };
  }

  async updateCustomer(input: UpdateCustomerInput): Promise<UpdateCustomerResult> {
    readRequiredString(input.companyId, "company");
    readRequiredString(input.userId, "owner");
    readRequiredString(input.customerId, "customer id");
    readRequiredString(input.field, "field");
    readRequiredString(input.value, "value");
    const customer = await this.repository.updateCustomer(input);
    return { customer };
  }
}
