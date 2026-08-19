/**
 * Company-specific payable overlay on top of package list prices.
 * Catalog prices on `plans` must never be overwritten.
 */

export type CompanyPricingSource = "list" | "discount" | "custom";

export type CompanyCommercialTerms = {
  company_id: string;
  pricing_source: CompanyPricingSource;
  discount_percent: number;
  custom_price_monthly: number | null;
  custom_price_yearly: number | null;
  custom_package_name?: string | null;
  notes: string | null;
  configured_at?: string | null;
};

export type PackageListPricing = {
  pricing_mode?: string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
};

export type CompanyPayablePreview = {
  billingCycle: "monthly" | "yearly";
  listAmount: number | null;
  payableAmount: number | null;
  source: "none" | "free" | "list" | "discount" | "custom";
  discountPercent: number;
  currency: string | null;
  onlineCheckoutAllowed: boolean;
};

export function resolveListAmount(
  pricing: PackageListPricing | null | undefined,
  billingCycle: "monthly" | "yearly",
): number | null {
  if (!pricing) return null;
  if (String(pricing.pricing_mode ?? "").toLowerCase() === "free") return 0;
  const amount = billingCycle === "yearly" ? Number(pricing.price_yearly) : Number(pricing.price_monthly);
  if (!Number.isFinite(amount)) return null;
  return amount;
}

export function resolveCompanyPayablePreview(input: {
  billingCycle: "monthly" | "yearly";
  plan: PackageListPricing | null | undefined;
  terms: CompanyCommercialTerms | null | undefined;
  currency?: string | null;
}): CompanyPayablePreview {
  const listAmount = resolveListAmount(input.plan, input.billingCycle);
  const source = input.terms?.pricing_source ?? "list";
  const discountPercent = Number(input.terms?.discount_percent ?? 0);
  const mode = String(input.plan?.pricing_mode ?? "fixed").toLowerCase();

  if (!input.plan) {
    return {
      billingCycle: input.billingCycle,
      listAmount: null,
      payableAmount: null,
      source: "none",
      discountPercent,
      currency: input.currency ?? null,
      onlineCheckoutAllowed: false,
    };
  }

  if (mode === "free") {
    return {
      billingCycle: input.billingCycle,
      listAmount: 0,
      payableAmount: 0,
      source: "free",
      discountPercent,
      currency: input.currency ?? null,
      onlineCheckoutAllowed: false,
    };
  }

  let payableAmount = listAmount;
  let payableSource: CompanyPayablePreview["source"] = listAmount == null ? "none" : "list";

  if (source === "custom") {
    const custom =
      input.billingCycle === "yearly"
        ? Number(input.terms?.custom_price_yearly)
        : Number(input.terms?.custom_price_monthly);
    payableAmount = Number.isFinite(custom) && custom >= 0 ? custom : null;
    payableSource = "custom";
  } else if (source === "discount" && listAmount != null) {
    const pct = Math.min(100, Math.max(0, discountPercent));
    payableAmount = Math.round(listAmount * (1 - pct / 100) * 100) / 100;
    payableSource = "discount";
  }

  const onlineCheckoutAllowed =
    (payableSource === "list" || payableSource === "discount" || payableSource === "custom") &&
    mode !== "free" &&
    !(mode === "custom" && payableSource === "list") &&
    payableAmount != null &&
    payableAmount > 0;

  return {
    billingCycle: input.billingCycle,
    listAmount,
    payableAmount,
    source: payableSource,
    discountPercent,
    currency: input.currency ?? null,
    onlineCheckoutAllowed,
  };
}
