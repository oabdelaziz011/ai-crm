/**
 * Dual-currency resolution helpers (client-side).
 * Operational ≠ subscription — never interchange these.
 */

import { normalizeCurrencyCode } from "@/lib/currency/catalog";

export type DualCurrencySnapshot = {
  operationalCurrency: string;
  subscriptionBillingCurrency: string | null;
};

export function resolveOperationalCurrency(input: {
  financialSettingsCurrency?: string | null;
  billingSettingCurrency?: string | null;
  runtimeCurrency?: string | null;
  fallback?: string;
}): string {
  return (
    normalizeCurrencyCode(input.financialSettingsCurrency) ||
    normalizeCurrencyCode(input.billingSettingCurrency) ||
    normalizeCurrencyCode(input.runtimeCurrency) ||
    normalizeCurrencyCode(input.fallback) ||
    "EGP"
  );
}

export function resolveSubscriptionBillingCurrency(input: {
  commercialTermsCurrency?: string | null;
  subscriptionCurrency?: string | null;
  planPricingCurrency?: string | null;
  platformDefaultCurrency?: string | null;
  fallback?: string;
}): string {
  return (
    normalizeCurrencyCode(input.commercialTermsCurrency) ||
    normalizeCurrencyCode(input.subscriptionCurrency) ||
    normalizeCurrencyCode(input.planPricingCurrency) ||
    normalizeCurrencyCode(input.platformDefaultCurrency) ||
    normalizeCurrencyCode(input.fallback) ||
    "USD"
  );
}

/**
 * Architectural independence: operational and subscription currencies may be
 * equal (both USD) or different (EGP vs USD). Equality does not mean they are
 * the same field — callers must still resolve each from its own source of truth.
 */
export function assertDualCurrencySourcesDistinct(input: {
  operationalSource: string;
  subscriptionSource: string;
}): boolean {
  return input.operationalSource !== input.subscriptionSource;
}
