import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoShowRuleConfig } from "@/lib/scheduling/operations/automation/no-show-types";

type NoShowRuleRow = {
  id: string;
  company_id: string;
  branch_id: string | null;
  enabled: boolean;
  grace_period_minutes: number;
};

export class NoShowRulesRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<NoShowRuleConfig[]> {
    const { data, error } = await this.client
      .from("scheduling_no_show_rules")
      .select("*")
      .eq("company_id", companyId)
      .order("branch_id", { ascending: true, nullsFirst: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map(mapRow);
  }

  async getEffectiveRule(
    companyId: string,
    branchId: string | null,
  ): Promise<NoShowRuleConfig | null> {
    const rules = await this.listByCompany(companyId);
    if (rules.length === 0) return null;

    if (branchId) {
      const branchRule = rules.find((r) => r.branchId === branchId);
      if (branchRule) return branchRule;
    }

    return rules.find((r) => r.branchId === null) ?? rules[0] ?? null;
  }
}

function mapRow(row: NoShowRuleRow): NoShowRuleConfig {
  return {
    id: row.id,
    companyId: row.company_id,
    branchId: row.branch_id,
    enabled: row.enabled,
    gracePeriodMinutes: row.grace_period_minutes as NoShowRuleConfig["gracePeriodMinutes"],
  };
}
