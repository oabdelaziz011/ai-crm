import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerLookupField } from "@workspace/automation-platform";
import type { CustomerRecord, CustomerRepositoryPort } from "@workspace/automation-platform";

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
      .select("id, name, email, phone, notes, created_at, updated_at")
      .eq(column, input.lookupBy === "email" ? normalizedValue.toLowerCase() : normalizedValue)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { count: 0, record: null };

    return { count: 1, record: mapCustomerRecord(data) };
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
    notes: row.notes == null ? null : String(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
