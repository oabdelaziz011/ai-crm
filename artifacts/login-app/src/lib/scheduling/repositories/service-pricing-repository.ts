import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SchedulingPricingRuleType,
  SchedulingServicePricingRule,
} from "@/lib/scheduling/types";

const RULE_SELECT = `
  id, company_id, service_id, type_id, price_cents, currency, duration_minutes,
  is_default, description, created_at, updated_at, created_by, updated_by, deleted_at,
  type:scheduling_pricing_rule_types!type_id ( id, code, label )
`;

function mapRule(row: Record<string, unknown>): SchedulingServicePricingRule {
  const typeJoin = row.type as { id: string; code: string; label: string } | null | undefined;
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    service_id: String(row.service_id),
    type_id: String(row.type_id),
    price_cents: Number(row.price_cents) || 0,
    currency: String(row.currency ?? "USD").toUpperCase(),
    duration_minutes: Number(row.duration_minutes) || 0,
    is_default: Boolean(row.is_default),
    description: row.description != null ? String(row.description) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    created_by: row.created_by != null ? String(row.created_by) : null,
    updated_by: row.updated_by != null ? String(row.updated_by) : null,
    deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
    type: typeJoin ? { id: typeJoin.id, code: typeJoin.code, label: typeJoin.label } : null,
  };
}

export class ServicePricingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listTypes(companyId: string): Promise<SchedulingPricingRuleType[]> {
    // Seed is best-effort — never block the read path if upsert is denied/unavailable.
    await this.ensureDefaultTypes(companyId);

    const { data, error } = await this.client
      .from("scheduling_pricing_rule_types")
      .select("id, company_id, code, label, sort_order, active, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SchedulingPricingRuleType[];
  }

  async ensureDefaultTypes(companyId: string): Promise<void> {
    const seeds = [
      { code: "New", label: "New", sort_order: 0 },
      { code: "FollowUp", label: "Follow Up", sort_order: 1 },
      { code: "Consultation", label: "Consultation", sort_order: 2 },
      { code: "Emergency", label: "Emergency", sort_order: 3 },
      { code: "VIP", label: "VIP", sort_order: 4 },
    ];

    const { count, error: countError } = await this.client
      .from("scheduling_pricing_rule_types")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("active", true);
    if (countError) {
      // Table missing / RLS / network — listTypes will surface the select error if needed.
      return;
    }
    if ((count ?? 0) > 0) return;

    const { error } = await this.client.from("scheduling_pricing_rule_types").upsert(
      seeds.map((seed) => ({
        company_id: companyId,
        code: seed.code,
        label: seed.label,
        sort_order: seed.sort_order,
        active: true,
      })),
      { onConflict: "company_id,code", ignoreDuplicates: true },
    );
    // Ignore seed failures (e.g. missing scheduling.edit) — UI shows empty state.
    void error;
  }

  async listRulesForService(
    companyId: string,
    serviceId: string,
  ): Promise<SchedulingServicePricingRule[]> {
    const { data, error } = await this.client
      .from("scheduling_service_pricing_rules")
      .select(RULE_SELECT)
      .eq("company_id", companyId)
      .eq("service_id", serviceId)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapRule(row as Record<string, unknown>));
  }

  async getRuleById(
    companyId: string,
    ruleId: string,
  ): Promise<SchedulingServicePricingRule | null> {
    const { data, error } = await this.client
      .from("scheduling_service_pricing_rules")
      .select(RULE_SELECT)
      .eq("company_id", companyId)
      .eq("id", ruleId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapRule(data as Record<string, unknown>) : null;
  }

  async getDefaultRule(
    companyId: string,
    serviceId: string,
  ): Promise<SchedulingServicePricingRule | null> {
    const { data, error } = await this.client
      .from("scheduling_service_pricing_rules")
      .select(RULE_SELECT)
      .eq("company_id", companyId)
      .eq("service_id", serviceId)
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapRule(data as Record<string, unknown>) : null;
  }

  async getRuleByTypeCode(
    companyId: string,
    serviceId: string,
    typeCode: string,
  ): Promise<SchedulingServicePricingRule | null> {
    const { data: typeRow, error: typeError } = await this.client
      .from("scheduling_pricing_rule_types")
      .select("id")
      .eq("company_id", companyId)
      .eq("code", typeCode)
      .maybeSingle();
    if (typeError) throw new Error(typeError.message);
    if (!typeRow) return null;

    const { data, error } = await this.client
      .from("scheduling_service_pricing_rules")
      .select(RULE_SELECT)
      .eq("company_id", companyId)
      .eq("service_id", serviceId)
      .eq("type_id", typeRow.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapRule(data as Record<string, unknown>) : null;
  }

  async replaceRulesForService(
    companyId: string,
    serviceId: string,
    userId: string,
    rules: Array<{
      id?: string;
      typeId: string;
      priceCents: number;
      currency: string;
      durationMinutes: number;
      isDefault: boolean;
      description?: string | null;
    }>,
  ): Promise<SchedulingServicePricingRule[]> {
    const existing = await this.listRulesForService(companyId, serviceId);
    const keepIds = new Set(rules.map((r) => r.id).filter(Boolean) as string[]);

    for (const old of existing) {
      if (!keepIds.has(old.id)) {
        const { error } = await this.client
          .from("scheduling_service_pricing_rules")
          .update({ deleted_at: new Date().toISOString(), updated_by: userId, is_default: false })
          .eq("id", old.id)
          .eq("company_id", companyId);
        if (error) throw new Error(error.message);
      }
    }

    // Clear defaults first so unique index allows reassignment.
    const { error: clearError } = await this.client
      .from("scheduling_service_pricing_rules")
      .update({ is_default: false, updated_by: userId })
      .eq("company_id", companyId)
      .eq("service_id", serviceId)
      .is("deleted_at", null);
    if (clearError) throw new Error(clearError.message);

    for (const rule of rules) {
      const payload = {
        company_id: companyId,
        service_id: serviceId,
        type_id: rule.typeId,
        price_cents: rule.priceCents,
        currency: rule.currency.toUpperCase(),
        duration_minutes: rule.durationMinutes,
        is_default: rule.isDefault,
        description: rule.description ?? null,
        updated_by: userId,
        deleted_at: null,
      };

      if (rule.id) {
        const { error } = await this.client
          .from("scheduling_service_pricing_rules")
          .update(payload)
          .eq("id", rule.id)
          .eq("company_id", companyId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await this.client.from("scheduling_service_pricing_rules").insert({
          ...payload,
          created_by: userId,
        });
        if (error) throw new Error(error.message);
      }
    }

    return this.listRulesForService(companyId, serviceId);
  }
}
