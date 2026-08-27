/**
 * Commercial package list-price helpers (Phase 7.4).
 * Pricing is commercial metadata only — never runtime authorization.
 */

import { formatBillingCurrency } from "@/lib/billing/format";

export type PackagePricingMode = "free" | "fixed" | "custom";

export type PackagePricingInput = {
  pricing_mode?: PackagePricingMode | string | null;
  price_monthly?: number | null;
  price_yearly?: number | null;
};

export function normalizePackagePricingMode(
  mode: string | null | undefined,
  priceMonthly?: number | null,
  priceYearly?: number | null,
): PackagePricingMode {
  const trimmed = String(mode ?? "")
    .trim()
    .toLowerCase();
  if (trimmed === "free" || trimmed === "fixed" || trimmed === "custom") {
    return trimmed;
  }
  const monthly = Number(priceMonthly ?? 0);
  const yearly = Number(priceYearly ?? 0);
  if (monthly === 0 && yearly === 0) return "free";
  return "fixed";
}

export function resolvePackageListAmount(
  pricing: PackagePricingInput,
  billingCycle: "monthly" | "yearly",
): number | null {
  const mode = normalizePackagePricingMode(
    pricing.pricing_mode,
    pricing.price_monthly,
    pricing.price_yearly,
  );
  if (mode === "custom") {
    const amount =
      billingCycle === "yearly"
        ? Number(pricing.price_yearly ?? 0)
        : Number(pricing.price_monthly ?? 0);
    return amount > 0 ? amount : null;
  }
  if (mode === "free") return 0;
  return billingCycle === "yearly"
    ? Number(pricing.price_yearly ?? 0)
    : Number(pricing.price_monthly ?? 0);
}

export type AnnualSavings = {
  savings: number;
  savingsPercent: number | null;
  effectiveMonthly: number | null;
};

/** Derived annual savings from stored list prices. Does not mutate catalog. */
export function calculateAnnualSavings(
  priceMonthly: number | null | undefined,
  priceYearly: number | null | undefined,
): AnnualSavings {
  const monthly = Number(priceMonthly ?? 0);
  const yearly = Number(priceYearly ?? 0);
  if (!Number.isFinite(monthly) || !Number.isFinite(yearly) || monthly <= 0 || yearly < 0) {
    return { savings: 0, savingsPercent: null, effectiveMonthly: null };
  }
  const fullYear = monthly * 12;
  const savings = fullYear - yearly;
  if (fullYear <= 0) {
    return { savings: 0, savingsPercent: null, effectiveMonthly: yearly / 12 };
  }
  return {
    savings,
    savingsPercent: (savings / fullYear) * 100,
    effectiveMonthly: yearly / 12,
  };
}

export type FormatPackagePriceOptions = {
  currency?: string;
  billingCycle?: "monthly" | "yearly";
  /** When true, append /month or /year for fixed prices. */
  withPeriod?: boolean;
  freeLabel?: string;
  customLabel?: string;
  listPricePrefix?: string | null;
};

/**
 * Consistent package list-price presentation.
 * Uses billing default currency via formatBillingCurrency when currency omitted.
 */
export function formatPackageListPrice(
  pricing: PackagePricingInput,
  options: FormatPackagePriceOptions = {},
): string {
  const mode = normalizePackagePricingMode(
    pricing.pricing_mode,
    pricing.price_monthly,
    pricing.price_yearly,
  );
  if (mode === "free") {
    return options.freeLabel ?? "Free";
  }
  if (mode === "custom") {
    const amount = resolvePackageListAmount(pricing, options.billingCycle ?? "monthly");
    if (amount == null) {
      return options.customLabel ?? "Custom / Contact sales";
    }
  }

  const cycle = options.billingCycle ?? "monthly";
  const amount = resolvePackageListAmount(pricing, cycle);
  if (amount == null) {
    return options.customLabel ?? "Custom / Contact sales";
  }

  const formatted = formatBillingCurrency(amount, options.currency);
  const period =
    options.withPeriod === false ? "" : cycle === "yearly" ? "/year" : "/month";
  const prefix = options.listPricePrefix ? `${options.listPricePrefix} ` : "";
  return `${prefix}${formatted}${period}`;
}

export function formatPackageMonthlyAndYearly(
  pricing: PackagePricingInput,
  currency?: string,
  labels?: { free?: string; custom?: string },
): { monthly: string; yearly: string; savings: AnnualSavings } {
  const mode = normalizePackagePricingMode(
    pricing.pricing_mode,
    pricing.price_monthly,
    pricing.price_yearly,
  );
  const savings = calculateAnnualSavings(pricing.price_monthly, pricing.price_yearly);
  const freeLabel = labels?.free ?? "Free";
  const customLabel = labels?.custom ?? "Custom";

  if (mode === "free") {
    return { monthly: freeLabel, yearly: freeLabel, savings };
  }
  if (mode === "custom") {
    const monthlyAmount = Number(pricing.price_monthly ?? 0);
    const yearlyAmount = Number(pricing.price_yearly ?? 0);
    return {
      monthly:
        monthlyAmount > 0
          ? formatBillingCurrency(monthlyAmount, currency)
          : customLabel,
      yearly:
        yearlyAmount > 0 ? formatBillingCurrency(yearlyAmount, currency) : customLabel,
      savings,
    };
  }

  return {
    monthly: formatBillingCurrency(Number(pricing.price_monthly ?? 0), currency),
    yearly: formatBillingCurrency(Number(pricing.price_yearly ?? 0), currency),
    savings,
  };
}
