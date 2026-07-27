import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaxCalculation } from "@/lib/billing/types/financial-types";
import type { TaxMode } from "@/lib/billing/types/financial-enums";
import { applyPercentageDiscount, sumCents } from "@/lib/billing/utilities/money";

/** VAT and multi-tax calculation engine. */
export class TaxEngineService {
  constructor(private readonly client: SupabaseClient) {}

  async getRate(companyId: string, countryCode = "EG"): Promise<{ ratePercent: number; isInclusive: boolean; isExempt: boolean }> {
    const { data } = await this.client
      .from("tax_configurations")
      .select("rate_percent, is_inclusive, is_exempt")
      .eq("company_id", companyId)
      .eq("country_code", countryCode)
      .eq("is_active", true)
      .maybeSingle();

    return {
      ratePercent: Number(data?.rate_percent ?? 0),
      isInclusive: Boolean(data?.is_inclusive),
      isExempt: Boolean(data?.is_exempt),
    };
  }

  async calculate(
    companyId: string,
    subtotalCents: number,
    taxMode: TaxMode = "exclusive",
    countryCode = "EG",
  ): Promise<TaxCalculation> {
    const config = await this.getRate(companyId, countryCode);

    if (taxMode === "exempt" || config.isExempt) {
      return {
        taxCents: 0,
        subtotalCents,
        totalCents: subtotalCents,
        ratePercent: 0,
        taxMode: "exempt",
      };
    }

    const effectiveMode = taxMode === "inclusive" || config.isInclusive ? "inclusive" : "exclusive";

    if (effectiveMode === "inclusive") {
      const taxCents = Math.round(subtotalCents - subtotalCents / (1 + config.ratePercent / 100));
      return {
        taxCents,
        subtotalCents: subtotalCents - taxCents,
        totalCents: subtotalCents,
        ratePercent: config.ratePercent,
        taxMode: "inclusive",
      };
    }

    const taxCents = applyPercentageDiscount(subtotalCents, config.ratePercent);
    return {
      taxCents,
      subtotalCents,
      totalCents: sumCents([subtotalCents, taxCents]),
      ratePercent: config.ratePercent,
      taxMode: "exclusive",
    };
  }
}
