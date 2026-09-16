import { supabase } from "@/lib/supabase";
import {
  pickExactCompanyCustomerMatch,
  type ExactCustomerMatchCandidate,
} from "@/lib/email-workspace/email-compose-new";

/**
 * Exact company-scoped customer email lookup for New Email.
 * Reuses the same identity rule as inbound email: exact email, no phone, no cross-company.
 */
export async function findExactCompanyCustomerByEmail(input: {
  companyId: string;
  recipientEmail: string;
}): Promise<string | null> {
  const companyId = input.companyId.trim();
  const recipientEmail = input.recipientEmail.trim();
  if (!companyId || !recipientEmail) return null;

  const { data, error } = await supabase
    .from("customers")
    .select("id, company_id, email")
    .eq("company_id", companyId)
    .eq("email", recipientEmail.toLowerCase());

  if (error) throw new Error(error.message);

  const candidates: ExactCustomerMatchCandidate[] = (data ?? []).map((row) => ({
    id: String(row.id),
    companyId: String(row.company_id),
    email: typeof row.email === "string" ? row.email : null,
  }));

  const match = pickExactCompanyCustomerMatch({
    companyId,
    recipientEmail,
    candidates,
  });
  return match.customerId;
}
