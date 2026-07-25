import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerLookupField } from "../lookup/types.js";
import type { CustomerRecord } from "../types/find-customer-input.js";
import type { CreateCustomerInput, UpdateCustomerInput } from "../types/customer-mutation-input.js";
import type { CustomerRepositoryPort } from "../customer/customer-repository-port.js";

const CUSTOMER_COLUMNS = "id, name, email, phone, age, gender, notes, created_at, updated_at";

function parseAgeValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 150) {
    throw new Error("Age must be a whole number between 0 and 150.");
  }
  return parsed;
}

function normalizeGender(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export class SupabaseCustomerRepository implements CustomerRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async findCustomersByField(input: {
    lookupBy: CustomerLookupField;
    lookupValue: string;
  }): Promise<{ count: number; record: CustomerRecord | null }> {
    const normalizedValue = input.lookupValue.trim();
    const column = mapLookupColumn(input.lookupBy);

    const { count, error: countError } = await this.client
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq(column, input.lookupBy === "email" ? normalizedValue.toLowerCase() : normalizedValue);

    if (countError) throw new Error(countError.message);

    const matchCount = count ?? 0;
    if (matchCount === 0) {
      return { count: 0, record: null };
    }
    if (matchCount > 1) {
      return { count: matchCount, record: null };
    }

    const { data, error } = await this.client
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .eq(column, input.lookupBy === "email" ? normalizedValue.toLowerCase() : normalizedValue)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { count: 0, record: null };

    return { count: 1, record: mapCustomerRecord(data) };
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
    const { data, error } = await this.client
      .from("customers")
      .insert({
        user_id: input.userId,
        name: input.name.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        age: input.age ?? null,
        gender: normalizeGender(input.gender),
        notes: input.notes?.trim() || null,
      })
      .select(CUSTOMER_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return mapCustomerRecord(data as Record<string, unknown>);
  }

  async updateCustomer(input: UpdateCustomerInput): Promise<CustomerRecord> {
    const field = input.field.trim();
    if (!["name", "email", "phone", "age", "gender", "notes"].includes(field)) {
      throw new Error(`Unsupported customer field: ${field}`);
    }

    const updateValue =
      field === "age"
        ? parseAgeValue(input.value)
        : field === "gender"
          ? normalizeGender(input.value)
          : input.value;

    const { data, error } = await this.client
      .from("customers")
      .update({ [field]: updateValue })
      .eq("id", input.customerId)
      .select(CUSTOMER_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    return mapCustomerRecord(data as Record<string, unknown>);
  }
}

function mapLookupColumn(lookupBy: CustomerLookupField): string {
  switch (lookupBy) {
    case "phone":
      return "phone";
    case "email":
      return "email";
    case "customer_id":
      return "id";
    default:
      return "id";
  }
}

function mapCustomerRecord(row: Record<string, unknown>): CustomerRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    age: row.age == null ? null : Number(row.age),
    gender: row.gender == null ? null : String(row.gender),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
