/** Money utilities — all financial math in cents to avoid float errors. */

export function centsFromDecimal(amount: number): number {
  return Math.round(amount * 100);
}

export function decimalFromCents(cents: number): number {
  return cents / 100;
}

export function formatMoney(cents: number, currency = "USD", locale = "en"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(decimalFromCents(cents));
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function applyPercentageDiscount(amountCents: number, percent: number): number {
  return Math.round(amountCents * (percent / 100));
}

export function clampCents(value: number, min = 0, max?: number): number {
  const clamped = Math.max(min, value);
  return max !== undefined ? Math.min(clamped, max) : clamped;
}
