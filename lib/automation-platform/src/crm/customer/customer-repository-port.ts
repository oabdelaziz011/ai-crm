import type { CustomerLookupField } from "../lookup/types.js";
import type { CustomerRecord } from "../types/find-customer-input.js";
import type { CreateCustomerInput, UpdateCustomerInput } from "../types/customer-mutation-input.js";

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

export class InMemoryCustomerRepository implements CustomerRepositoryPort {
  private readonly customers: CustomerRecord[] = [];

  seed(customer: CustomerRecord): void {
    this.customers.push(customer);
  }

  list(): CustomerRecord[] {
    return [...this.customers];
  }

  async findCustomersByField(input: {
    companyId: string;
    lookupBy: CustomerLookupField;
    lookupValue: string;
  }): Promise<{ count: number; record: CustomerRecord | null }> {
    const normalizedValue = input.lookupValue.trim();
    const matches = this.customers.filter((customer) => {
      switch (input.lookupBy) {
        case "phone":
          return (customer.phone ?? "").trim() === normalizedValue;
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
      return { count: 1, record: matches[0]! };
    }
    return { count, record: null };
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
    const normalizedEmail = input.email?.trim().toLowerCase() ?? null;
    if (normalizedEmail) {
      const existing = this.customers.filter(
        (customer) => (customer.email ?? "").trim().toLowerCase() === normalizedEmail,
      );
      if (existing.length > 0) {
        throw new Error('duplicate key value violates unique constraint "idx_customers_company_email_unique"');
      }
    }
    const now = new Date().toISOString();
    const record: CustomerRecord = {
      id: `cust-${this.customers.length + 1}`,
      name: input.name.trim(),
      email: normalizedEmail,
      phone: input.phone ?? null,
      age: input.age ?? null,
      gender: input.gender ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.customers.push(record);
    return record;
  }

  async updateCustomer(input: UpdateCustomerInput): Promise<CustomerRecord> {
    const customer = this.customers.find((entry) => entry.id === input.customerId);
    if (!customer) throw new Error(`Customer ${input.customerId} not found.`);
    const field = input.field.trim();
    if (field === "name") customer.name = input.value;
    else if (field === "email") customer.email = input.value;
    else if (field === "phone") customer.phone = input.value;
    else if (field === "age") customer.age = parseAgeValue(input.value);
    else if (field === "gender") customer.gender = input.value.trim() || null;
    else if (field === "notes") customer.notes = input.value;
    else throw new Error(`Unsupported customer field: ${field}`);
    customer.updatedAt = new Date().toISOString();
    return customer;
  }
}
