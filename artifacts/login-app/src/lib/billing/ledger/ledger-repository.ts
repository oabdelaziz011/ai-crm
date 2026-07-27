import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerEntry } from "@/lib/billing/types/financial-types";
import type { LedgerDirection, LedgerEntryType } from "@/lib/billing/types/financial-enums";

export class LedgerRepository {
  constructor(private readonly client: SupabaseClient) {}

  async append(input: {
    companyId: string;
    entryType: LedgerEntryType;
    direction: LedgerDirection;
    amountCents: number;
    currency: string;
    referenceType: string;
    referenceId: string;
    description: string;
    metadata?: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<string> {
    const { data, error } = await this.client.rpc("financial_append_ledger", {
      p_company_id: input.companyId,
      p_entry_type: input.entryType,
      p_direction: input.direction,
      p_amount_cents: input.amountCents,
      p_currency: input.currency,
      p_reference_type: input.referenceType,
      p_reference_id: input.referenceId,
      p_description: input.description,
      p_metadata: input.metadata ?? {},
      p_created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(error.message);
    return String(data);
  }

  async listByCompany(companyId: string, limit = 100): Promise<LedgerEntry[]> {
    const { data, error } = await this.client
      .from("financial_ledger_entries")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id),
      entryType: row.entry_type as LedgerEntryType,
      direction: row.direction as LedgerDirection,
      amountCents: Number(row.amount_cents),
      currency: String(row.currency),
      referenceType: String(row.reference_type),
      referenceId: String(row.reference_id),
      description: String(row.description),
      createdAt: String(row.created_at),
    }));
  }
}
