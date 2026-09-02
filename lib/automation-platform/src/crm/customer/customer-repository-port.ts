import type { CustomerLookupField } from "../lookup/types.js";
import type { CustomerRecord } from "../types/find-customer-input.js";
import type {
  CreateCustomerInput,
  CustomerPhoneIdentityWrite,
  UpdateCustomerInput,
} from "../types/customer-mutation-input.js";
import { resolvePhoneIdentityWrite } from "./customer-phone-identity-write.js";

function parseAgeValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - "٠".charCodeAt(0)))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - "۰".charCodeAt(0)));
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 150) {
    throw new Error("Age must be a whole number between 0 and 150.");
  }
  return parsed;
}

export interface CustomerRepositoryPort {
  findCustomersByField(input: {
    companyId: string;
    lookupBy: CustomerLookupField;
    lookupValue: string;
  }): Promise<{ count: number; record: CustomerRecord | null }>;

  createCustomer(input: CreateCustomerInput): Promise<CustomerRecord>;

  updateCustomer(input: UpdateCustomerInput): Promise<CustomerRecord>;
}

type InMemoryCustomer = CustomerRecord & {
  companyId: string;
  phoneIdentity: CustomerPhoneIdentityWrite;
};

export class InMemoryCustomerRepository implements CustomerRepositoryPort {
  private readonly customers: InMemoryCustomer[] = [];

  seed(
    customer: CustomerRecord & {
      companyId?: string;
      phoneIdentity?: CustomerPhoneIdentityWrite;
    },
  ): void {
    this.customers.push({
      ...customer,
      companyId: customer.companyId ?? "company-default",
      // Seed fixtures may carry unresolved legacy phones; create/update still fail-closed.
      phoneIdentity: customer.phoneIdentity ?? {
        phone_e164: null,
        phone_country_iso: null,
        phone_region_source: customer.phone?.trim() ? "unresolved" : null,
        phone_national: null,
      },
    });
  }

  list(): CustomerRecord[] {
    return this.customers.map(({ companyId: _c, phoneIdentity: _p, ...record }) => record);
  }

  /** Test helper: identity columns for a customer id. */
  getPhoneIdentity(customerId: string): CustomerPhoneIdentityWrite | null {
    return this.customers.find((c) => c.id === customerId)?.phoneIdentity ?? null;
  }

  async findCustomersByField(input: {
    companyId: string;
    lookupBy: CustomerLookupField;
    lookupValue: string;
  }): Promise<{ count: number; record: CustomerRecord | null }> {
    const normalizedValue = input.lookupValue.trim();
    const matches = this.customers.filter((customer) => {
      if (customer.companyId !== input.companyId) return false;
      switch (input.lookupBy) {
        case "phone":
          return (customer.phone ?? "").trim() === normalizedValue;
        case "phone_e164":
          return (customer.phoneIdentity.phone_e164 ?? "").trim() === normalizedValue;
        case "email":
          return (customer.email ?? "").trim().toLowerCase() === normalizedValue.toLowerCase();
        case "customer_id":
          return customer.id === normalizedValue;
        default:
          return false;
      }
    });

    const count = matches.length;
    if (count === 1) {
      const { companyId: _c, phoneIdentity: _p, ...record } = matches[0]!;
      return {
        count: 1,
        record: {
          ...record,
          phoneE164: matches[0]!.phoneIdentity.phone_e164,
        },
      };
    }
    return { count, record: null };
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
    const normalizedEmail = input.email?.trim().toLowerCase() ?? null;
    if (normalizedEmail) {
      const existing = this.customers.filter(
        (customer) =>
          customer.companyId === input.companyId &&
          (customer.email ?? "").trim().toLowerCase() === normalizedEmail,
      );
      if (existing.length > 0) {
        throw new Error('duplicate key value violates unique constraint "idx_customers_company_email_unique"');
      }
    }

    const phone = input.phone?.trim() || null;
    const phoneIdentity = resolvePhoneIdentityWrite(phone, input.phoneIdentity);
    if (phoneIdentity.phone_e164) {
      const e164Clash = this.customers.some(
        (customer) =>
          customer.companyId === input.companyId &&
          customer.phoneIdentity.phone_e164 === phoneIdentity.phone_e164,
      );
      if (e164Clash) {
        throw new Error(
          'duplicate key value violates unique constraint "idx_customers_company_phone_e164_unique"',
        );
      }
    }

    const now = new Date().toISOString();
    const record: InMemoryCustomer = {
      id: `cust-${this.customers.length + 1}`,
      companyId: input.companyId,
      name: input.name.trim(),
      email: normalizedEmail,
      phone,
      age: input.age ?? null,
      gender: input.gender ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      phoneIdentity,
    };
    this.customers.push(record);
    const { companyId: _c, phoneIdentity: _p, ...publicRecord } = record;
    return publicRecord;
  }

  async updateCustomer(input: UpdateCustomerInput): Promise<CustomerRecord> {
    const customer = this.customers.find(
      (entry) => entry.id === input.customerId && entry.companyId === input.companyId,
    );
    if (!customer) throw new Error(`Customer ${input.customerId} not found.`);
    const field = input.field.trim();
    if (field === "name") customer.name = input.value;
    else if (field === "email") customer.email = input.value;
    else if (field === "phone") {
      const phone = input.value?.trim() ? input.value.trim() : null;
      const phoneIdentity = resolvePhoneIdentityWrite(phone, input.phoneIdentity);
      if (phoneIdentity.phone_e164) {
        const e164Clash = this.customers.some(
          (other) =>
            other.companyId === input.companyId &&
            other.id !== customer.id &&
            other.phoneIdentity.phone_e164 === phoneIdentity.phone_e164,
        );
        if (e164Clash) {
          throw new Error(
            'duplicate key value violates unique constraint "idx_customers_company_phone_e164_unique"',
          );
        }
      }
      customer.phone = phone;
      customer.phoneIdentity = phoneIdentity;
    } else if (field === "age") customer.age = parseAgeValue(input.value);
    else if (field === "gender") customer.gender = input.value.trim() || null;
    else if (field === "notes") customer.notes = input.value;
    else throw new Error(`Unsupported customer field: ${field}`);
    customer.updatedAt = new Date().toISOString();
    const { companyId: _c, phoneIdentity: _p, ...publicRecord } = customer;
    return publicRecord;
  }
}
