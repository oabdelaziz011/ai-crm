import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingContext, PricingResult } from "@/lib/billing/types/financial-types";
import type { PricingRuleType } from "@/lib/billing/types/financial-enums";

/** Resolves price from service defaults and override rules. */
export class PricingEngineService {
  constructor(private readonly client: SupabaseClient) {}

  async resolve(context: PricingContext): Promise<PricingResult> {
    const rules = await this.fetchRules(context.companyId, context);

    const tierRule = context.customerTier
      ? rules.find((r) => r.rule_type === (context.customerTier === "vip" ? "vip" : "insurance"))
      : null;
    if (tierRule) return this.toResult(tierRule);

    const resourceRule = context.resourceId
      ? rules.find((r) => r.rule_type === "resource" && r.resource_id === context.resourceId)
      : null;
    if (resourceRule) return this.toResult(resourceRule);

    const branchRule = context.branchId
      ? rules.find((r) => r.rule_type === "branch" && r.branch_id === context.branchId)
      : null;
    if (branchRule) return this.toResult(branchRule);

    const serviceRule = rules.find((r) => r.rule_type === "service" && r.service_id === context.serviceId);
    if (serviceRule) return this.toResult(serviceRule);

    const { data: service } = await this.client
      .from("scheduling_services")
      .select("price_cents, currency")
      .eq("id", context.serviceId)
      .maybeSingle();

    return {
      priceCents: Number(service?.price_cents ?? 0),
      currency: String(service?.currency ?? "USD"),
      ruleType: "service_default",
    };
  }

  private async fetchRules(companyId: string, context: PricingContext) {
    let query = this.client
      .from("pricing_rules")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (context.serviceId) query = query.or(`service_id.eq.${context.serviceId},service_id.is.null`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  private toResult(row: Record<string, unknown>): PricingResult {
    return {
      priceCents: Number(row.price_cents),
      currency: String(row.currency ?? "USD"),
      ruleType: row.rule_type as PricingRuleType,
      ruleId: String(row.id),
    };
  }
}
