import type { CustomerLookupField } from "../lookup/types.js";
import type { CustomerRecord } from "../types/find-customer-input.js";

export interface CustomerRepositoryPort {
  findCustomersByField(input: {
    lookupBy: CustomerLookupField;
    lookupValue: string;
  }): Promise<{ count: number; record: CustomerRecord | null }>;
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
}
