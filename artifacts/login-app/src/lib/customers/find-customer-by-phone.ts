import { supabase } from "@/lib/supabase";
import type { Customer } from "@/lib/types";

const MATCH_COLUMNS =
  "id, name, email, phone, phone_e164, phone_country_iso, phone_national, gender, notes, age, company_id";

/**
 * Company-scoped CRM match for a verified phone.
 * Prefers canonical E.164, then the stored phone string.
 */
export async function findCustomerByVerifiedPhone(input: {
  companyId: string;
  phoneE164: string;
  rawPhone?: string | null;
}): Promise<Customer | null> {
  const e164 = input.phoneE164.trim();
  if (!e164) return null;

  const byE164 = await supabase
    .from("customers")
    .select(MATCH_COLUMNS)
    .eq("company_id", input.companyId)
    .eq("phone_e164", e164)
    .limit(1)
    .maybeSingle();
  if (byE164.error) throw new Error(byE164.error.message);
  if (byE164.data) return byE164.data as Customer;

  const byCanonical = await supabase
    .from("customers")
    .select(MATCH_COLUMNS)
    .eq("company_id", input.companyId)
    .eq("phone", e164)
    .limit(1)
    .maybeSingle();
  if (byCanonical.error) throw new Error(byCanonical.error.message);
  if (byCanonical.data) return byCanonical.data as Customer;

  const raw = input.rawPhone?.trim() ?? "";
  if (raw && raw !== e164) {
    const byRaw = await supabase
      .from("customers")
      .select(MATCH_COLUMNS)
      .eq("company_id", input.companyId)
      .eq("phone", raw)
      .limit(1)
      .maybeSingle();
    if (byRaw.error) throw new Error(byRaw.error.message);
    if (byRaw.data) return byRaw.data as Customer;
  }

  return null;
}
