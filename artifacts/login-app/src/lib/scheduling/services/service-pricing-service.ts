import type { ServicePricingRepository } from "@/lib/scheduling/repositories/service-pricing-repository";
import type { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import type {
  SchedulingPricingRuleType,
  SchedulingServicePricingRule,
} from "@/lib/scheduling/types";
import {
  pricingRuleFormSchema,
  type PricingRuleFormValues,
} from "@/lib/scheduling/validation/service-schemas";

export type PricingSnapshot = {
  ruleId: string | null;
  typeCode: string;
  typeLabel: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
};

export class ServicePricingService {
  constructor(
    private readonly pricingRepo: ServicePricingRepository,
    private readonly serviceRepo: SchedulingServiceCatalogRepository,
  ) {}

  listTypes(companyId: string): Promise<SchedulingPricingRuleType[]> {
    return this.pricingRepo.listTypes(companyId);
  }

  listRules(companyId: string, serviceId: string): Promise<SchedulingServicePricingRule[]> {
    return this.pricingRepo.listRulesForService(companyId, serviceId);
  }

  /**
   * Resolve immutable booking snapshot from a pricing rule.
   * Order: explicit rule id → type code → default rule → legacy service fields.
   */
  async resolveSnapshot(
    companyId: string,
    serviceId: string,
    options?: { pricingRuleId?: string | null; typeCode?: string | null },
  ): Promise<PricingSnapshot> {
    let rule: SchedulingServicePricingRule | null = null;

    if (options?.pricingRuleId) {
      rule = await this.pricingRepo.getRuleById(companyId, options.pricingRuleId);
      if (rule && rule.service_id !== serviceId) {
        throw new Error("Pricing rule does not belong to this service");
      }
    }

    if (!rule && options?.typeCode) {
      rule = await this.pricingRepo.getRuleByTypeCode(companyId, serviceId, options.typeCode);
    }

    if (!rule) {
      rule = await this.pricingRepo.getDefaultRule(companyId, serviceId);
    }

    if (rule) {
      return {
        ruleId: rule.id,
        typeCode: rule.type?.code ?? "New",
        typeLabel: rule.type?.label ?? rule.type?.code ?? "New",
        priceCents: Math.max(0, rule.price_cents),
        currency: rule.currency.toUpperCase(),
        durationMinutes: Math.max(1, rule.duration_minutes),
      };
    }

    const service = await this.serviceRepo.getById(serviceId, companyId);
    return {
      ruleId: null,
      typeCode: options?.typeCode?.trim() || "New",
      typeLabel: options?.typeCode?.trim() || "New",
      priceCents: Math.max(0, Number(service?.price_cents) || 0),
      currency: String(service?.currency ?? "USD").trim().toUpperCase() || "USD",
      durationMinutes: Math.max(1, Number(service?.duration_minutes) || 30),
    };
  }

  async saveRules(
    companyId: string,
    serviceId: string,
    userId: string,
    rules: PricingRuleFormValues[],
  ): Promise<SchedulingServicePricingRule[]> {
    const parsed = rules.map((rule) => pricingRuleFormSchema.parse(rule));
    if (!parsed.length) {
      throw new Error("At least one pricing rule is required");
    }
    const defaults = parsed.filter((rule) => rule.isDefault);
    if (defaults.length !== 1) {
      throw new Error("Exactly one pricing rule must be marked as default");
    }

    const typeIds = new Set(parsed.map((rule) => rule.typeId));
    if (typeIds.size !== parsed.length) {
      throw new Error("Each pricing rule type can only be used once per service");
    }

    const saved = await this.pricingRepo.replaceRulesForService(
      companyId,
      serviceId,
      userId,
      parsed.map((rule) => ({
        id: rule.id,
        typeId: rule.typeId,
        priceCents: Math.round(rule.price * 100),
        currency: rule.currency.toUpperCase(),
        durationMinutes: rule.durationMinutes,
        isDefault: rule.isDefault,
        description: rule.description ?? null,
      })),
    );

    // Keep legacy service columns in sync with the default rule for older consumers.
    const defaultRule = saved.find((rule) => rule.is_default) ?? saved[0];
    if (defaultRule) {
      await this.serviceRepo.update(serviceId, companyId, {
        price_cents: defaultRule.price_cents,
        currency: defaultRule.currency,
        duration_minutes: defaultRule.duration_minutes,
        updated_by: userId,
      });
    }

    return saved;
  }
}
