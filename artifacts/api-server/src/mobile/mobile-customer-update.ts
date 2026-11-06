/**
 * Customer updates must match the trusted company before any write.
 * A row that belongs to another company is treated as not found.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "../middleware/error-handler.js";

export async function updateOwnedCustomer(
  client: SupabaseClient,
  input: { companyId: string; id: string; name: string; phone: string | null },
): Promise<void> {
  const existing = await client
    .from("customers")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("id", input.id)
    .maybeSingle();
  if (existing.error || !existing.data) {
    throw new HttpError(404, "Record not found.", "not_found");
  }
  const updated = await client
    .from("customers")
    .update({ name: input.name, phone: input.phone })
    .eq("company_id", input.companyId)
    .eq("id", input.id)
    .select("id");
  if (updated.error || !updated.data?.length) {
    throw new HttpError(404, "Record not found.", "not_found");
  }
}
