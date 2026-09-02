import { ValidationError } from "../../errors.js";
import { CUSTOMER_LOOKUP_FIELDS, type CustomerLookupField } from "../lookup/types.js";
import type { CustomerRepositoryPort } from "./customer-repository-port.js";
import type { FindCustomerInput, FindCustomerResult, CustomerRecord } from "../types/find-customer-input.js";
import type { CreateCustomerInput, CreateCustomerResult, UpdateCustomerInput, UpdateCustomerResult } from "../types/customer-mutation-input.js";
import {
  formatAmbiguousCustomerEmailMessage,
  formatDuplicateCustomerPhoneMessage,
  normalizeCustomerEmail,
  toCustomerMutationError,
} from "./customer-email-utils.js";
import { resolvePhoneIdentityWrite } from "./customer-phone-identity-write.js";

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

  /**
   * Phase D3 — reject create when company + phone_e164 already owned.
   * Soft reuse remains the create_customer tool contract; this service rejects clearly.
   */
  private async assertPhoneE164Available(input: {
    companyId: string;
    userId: string;
    phone: string | null | undefined;
    phoneIdentity: CreateCustomerInput["phoneIdentity"];
    excludeCustomerId?: string;
  }): Promise<void> {
    const identity = resolvePhoneIdentityWrite(input.phone ?? null, input.phoneIdentity ?? null);
    const phoneE164 = identity.phone_e164?.trim();
    if (!phoneE164) return;

    const existing = await this.findCustomer({
      companyId: input.companyId,
      userId: input.userId,
      lookupBy: "phone_e164",
      lookupValue: phoneE164,
    });
    if (existing.status === "not_found") return;
    if (
      existing.status === "found" &&
      existing.customer &&
      input.excludeCustomerId &&
      existing.customer.id === input.excludeCustomerId
    ) {
      return;
    }
    throw new ValidationError(formatDuplicateCustomerPhoneMessage());
  }

  async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
    readRequiredString(input.companyId, "company");
    readRequiredString(input.userId, "owner");
    const name = readRequiredString(input.name, "name");
    try {
      await this.assertPhoneE164Available({
        companyId: input.companyId,
        userId: input.userId,
        phone: input.phone,
        phoneIdentity: input.phoneIdentity,
      });
      const customer = await this.repository.createCustomer({
        ...input,
        name,
        email: normalizeCustomerEmail(input.email) ?? input.email,
      });
      return { customer };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
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
    try {
      if (input.field.trim() === "phone") {
        await this.assertPhoneE164Available({
          companyId: input.companyId,
          userId: input.userId,
          phone: input.value,
          phoneIdentity: input.phoneIdentity,
          excludeCustomerId: input.customerId,
        });
      }
      const customer = await this.repository.updateCustomer(input);
      return { customer };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw toCustomerMutationError(error);
    }
  }
}
