import i18n from "@/i18n";

function billingFallback(): string {
  return i18n.t("billing.common.notAvailable");
}

export function formatBillingCurrency(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null || Number.isNaN(Number(amount))) return billingFallback();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${currency}`;
  }
}

export function formatBillingDate(value: string | null | undefined, withTime = false): string {
  if (!value) return billingFallback();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return billingFallback();
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

export function shortCompanyId(companyId: string): string {
  return companyId.slice(0, 8).toUpperCase();
}
