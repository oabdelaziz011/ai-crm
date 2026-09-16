/**
 * Official supported ISO 4217 currency catalog for ValueOR.
 * Prefer Intl for symbols/fraction digits; keep human names here for UI selects.
 */

export type CurrencyCatalogEntry = {
  code: string;
  nameEn: string;
  nameAr: string;
  /** Preferred symbol when known; Intl may still be used for formatting. */
  symbol?: string;
  fractionDigits: number;
};

/** Minimum officially supported set (extend via Intl when needed). */
export const OFFICIAL_CURRENCY_CODES = [
  "EGP",
  "USD",
  "SAR",
  "AED",
  "EUR",
  "GBP",
] as const;

export type OfficialCurrencyCode = (typeof OFFICIAL_CURRENCY_CODES)[number];

const CATALOG: Record<OfficialCurrencyCode, CurrencyCatalogEntry> = {
  EGP: {
    code: "EGP",
    nameEn: "Egyptian Pound",
    nameAr: "الجنيه المصري",
    symbol: "E£",
    fractionDigits: 2,
  },
  USD: {
    code: "USD",
    nameEn: "US Dollar",
    nameAr: "الدولار الأمريكي",
    symbol: "$",
    fractionDigits: 2,
  },
  SAR: {
    code: "SAR",
    nameEn: "Saudi Riyal",
    nameAr: "الريال السعودي",
    symbol: "﷼",
    fractionDigits: 2,
  },
  AED: {
    code: "AED",
    nameEn: "UAE Dirham",
    nameAr: "الدرهم الإماراتي",
    symbol: "د.إ",
    fractionDigits: 2,
  },
  EUR: {
    code: "EUR",
    nameEn: "Euro",
    nameAr: "اليورو",
    symbol: "€",
    fractionDigits: 2,
  },
  GBP: {
    code: "GBP",
    nameEn: "British Pound",
    nameAr: "الجنيه الإسترليني",
    symbol: "£",
    fractionDigits: 2,
  },
};

export function normalizeCurrencyCode(code: string | null | undefined): string | null {
  const next = String(code ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(next) ? next : null;
}

export function isOfficialCurrencyCode(code: string | null | undefined): code is OfficialCurrencyCode {
  const normalized = normalizeCurrencyCode(code);
  return Boolean(normalized && (OFFICIAL_CURRENCY_CODES as readonly string[]).includes(normalized));
}

export function getCurrencyCatalogEntry(code: string | null | undefined): CurrencyCatalogEntry | null {
  const normalized = normalizeCurrencyCode(code);
  if (!normalized) return null;
  if (isOfficialCurrencyCode(normalized)) return CATALOG[normalized];
  return {
    code: normalized,
    nameEn: normalized,
    nameAr: normalized,
    fractionDigits: 2,
  };
}

export function listOfficialCurrencies(): CurrencyCatalogEntry[] {
  return OFFICIAL_CURRENCY_CODES.map((code) => CATALOG[code]);
}

/** "EGP — Egyptian Pound" / "EGP — الجنيه المصري" */
export function formatCurrencyOptionLabel(
  code: string,
  locale: string | null | undefined,
): string {
  const entry = getCurrencyCatalogEntry(code);
  if (!entry) return String(code ?? "").toUpperCase();
  const isAr = String(locale ?? "").toLowerCase().startsWith("ar");
  const name = isAr ? entry.nameAr : entry.nameEn;
  return `${entry.code} — ${name}`;
}

export function currencyFractionDigits(code: string | null | undefined): number {
  const entry = getCurrencyCatalogEntry(code);
  if (entry) return entry.fractionDigits;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalizeCurrencyCode(code) || "USD",
    }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
