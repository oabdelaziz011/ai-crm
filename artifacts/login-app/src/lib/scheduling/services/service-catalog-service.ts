import type { SchedulingServiceCatalogRepository } from "@/lib/scheduling/repositories/service-catalog-repository";
import type { ServicePricingService } from "@/lib/scheduling/services/service-pricing-service";
import {
  serviceGeneralFormSchema,
  serviceFormSchema,
  type PricingRuleFormValues,
  type ServiceFormValues,
  type ServiceGeneralFormValues,
} from "@/lib/scheduling/validation/service-schemas";
import type { SchedulingService, ServiceInsert, ServiceUpdate } from "@/lib/scheduling/types";

export class ServiceCatalogService {
  constructor(
    private readonly repository: SchedulingServiceCatalogRepository,
    private readonly pricing?: ServicePricingService,
  ) {}

  list(companyId: string): Promise<SchedulingService[]> {
    return this.repository.listByCompany(companyId);
  }

  getById(id: string, companyId: string): Promise<SchedulingService | null> {
    return this.repository.getById(id, companyId);
  }

  async create(
    companyId: string,
    userId: string,
    input: ServiceFormValues | (ServiceGeneralFormValues & { pricingRules?: PricingRuleFormValues[] }),
  ): Promise<SchedulingService> {
    const hasRules = "pricingRules" in input && Array.isArray(input.pricingRules) && input.pricingRules.length > 0;
    const general = serviceGeneralFormSchema.parse(input);
    const bootstrap = hasRules
      ? null
      : serviceFormSchema.parse(input);

    const defaultRule = hasRules
      ? (input as { pricingRules: PricingRuleFormValues[] }).pricingRules.find((rule) => rule.isDefault) ??
        (input as { pricingRules: PricingRuleFormValues[] }).pricingRules[0]
      : null;

    const payload: ServiceInsert = {
      company_id: companyId,
      name: general.name,
      description: general.description ?? null,
      category: general.category ?? null,
      duration_minutes: defaultRule?.durationMinutes ?? bootstrap?.duration_minutes ?? 30,
      price_cents: defaultRule
        ? Math.round(defaultRule.price * 100)
        : Math.round((bootstrap?.price ?? 0) * 100),
      currency: (defaultRule?.currency ?? bootstrap?.currency ?? "USD").toUpperCase(),
      status: general.status,
      created_by: userId,
      updated_by: userId,
    };

    // Company-default sentinel must be resolved by the caller before save.
    if (payload.currency === "__COMPANY_DEFAULT__") {
      payload.currency = "USD";
    }

    const service = await this.repository.create(payload);

    if (hasRules && this.pricing) {
      const rules = (input as { pricingRules: PricingRuleFormValues[] }).pricingRules.map((rule) => ({
        ...rule,
        currency:
          rule.currency === "__COMPANY_DEFAULT__"
            ? payload.currency!
            : rule.currency.toUpperCase(),
      }));
      await this.pricing.saveRules(companyId, service.id, userId, rules);
      return (await this.repository.getById(service.id, companyId)) ?? service;
    }

    // Bootstrap a default New rule from legacy single-price create.
    if (this.pricing && payload.price_cents && payload.price_cents > 0) {
      const types = await this.pricing.listTypes(companyId);
      const newType = types.find((type) => type.code === "New") ?? types[0];
      if (newType) {
        await this.pricing.saveRules(companyId, service.id, userId, [
          {
            typeId: newType.id,
            price: (payload.price_cents ?? 0) / 100,
            currency: payload.currency ?? "USD",
            durationMinutes: payload.duration_minutes ?? 30,
            isDefault: true,
            description: null,
          },
        ]);
      }
    }

    return service;
  }

  async update(
    id: string,
    companyId: string,
    userId: string,
    input: ServiceGeneralFormValues | ServiceFormValues,
  ): Promise<SchedulingService> {
    const general = serviceGeneralFormSchema.parse(input);
    const payload: ServiceUpdate = {
      name: general.name,
      description: general.description ?? null,
      category: general.category ?? null,
      status: general.status,
      updated_by: userId,
    };

    // Legacy path still accepts price/duration on update when provided.
    if ("price" in input || "duration_minutes" in input || "currency" in input) {
      const legacy = serviceFormSchema.parse({ ...general, ...input });
      payload.duration_minutes = legacy.duration_minutes;
      payload.price_cents = Math.round(legacy.price * 100);
      payload.currency = legacy.currency.toUpperCase();
    }

    return this.repository.update(id, companyId, payload);
  }

  delete(id: string, companyId: string): Promise<void> {
    return this.repository.softDelete(id, companyId);
  }
}
