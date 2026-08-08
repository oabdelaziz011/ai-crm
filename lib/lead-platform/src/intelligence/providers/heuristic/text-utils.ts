import type { ProviderMessage } from "../../contracts/provider-context.js";

export const HEURISTIC_MODEL = "heuristic";
export const HEURISTIC_VERSION = "3.12.2";

export function joinedText(messages: readonly ProviderMessage[]): string {
  return messages.map((m) => m.content ?? "").join("\n");
}

export function customerText(messages: readonly ProviderMessage[]): string {
  return messages
    .filter((m) => {
      const role = String(m.role ?? "").toLowerCase();
      return role === "customer" || role === "user" || role === "lead" || role === "unknown";
    })
    .map((m) => m.content ?? "")
    .join("\n");
}

/** Rough Arabic vs English detection from script density. */
export function detectScriptLanguage(text: string): { lang: "ar" | "en" | "unknown"; confidence: number } {
  const cleaned = text.replace(/\s+/g, "");
  if (!cleaned) return { lang: "unknown", confidence: 0.2 };
  const arabic = (cleaned.match(/[\u0600-\u06FF]/g) ?? []).join("").length;
  const latin = (cleaned.match(/[A-Za-z]/g) ?? []).join("").length;
  const total = arabic + latin;
  if (total === 0) return { lang: "unknown", confidence: 0.25 };
  const arRatio = arabic / total;
  if (arRatio >= 0.55) return { lang: "ar", confidence: Math.min(0.95, 0.55 + arRatio * 0.4) };
  if (arRatio <= 0.35) return { lang: "en", confidence: Math.min(0.95, 0.55 + (1 - arRatio) * 0.4) };
  return { lang: arRatio >= 0.5 ? "ar" : "en", confidence: 0.55 };
}

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export type PhoneCountryHint = Readonly<{
  country: string;
  countryCode: string;
  market: string;
  timezone: string;
  currency: string;
  language: string;
  locale: string;
  confidence: number;
}>;

const DIAL_MAP: ReadonlyArray<{ prefix: string; hint: Omit<PhoneCountryHint, "confidence">; confidence: number }> = [
  {
    prefix: "+966",
    hint: {
      country: "Saudi Arabia",
      countryCode: "SA",
      market: "GCC",
      timezone: "Asia/Riyadh",
      currency: "SAR",
      language: "ar",
      locale: "ar-SA",
    },
    confidence: 0.92,
  },
  {
    prefix: "+971",
    hint: {
      country: "United Arab Emirates",
      countryCode: "AE",
      market: "GCC",
      timezone: "Asia/Dubai",
      currency: "AED",
      language: "ar",
      locale: "ar-AE",
    },
    confidence: 0.92,
  },
  {
    prefix: "+965",
    hint: {
      country: "Kuwait",
      countryCode: "KW",
      market: "GCC",
      timezone: "Asia/Kuwait",
      currency: "KWD",
      language: "ar",
      locale: "ar-KW",
    },
    confidence: 0.9,
  },
  {
    prefix: "+974",
    hint: {
      country: "Qatar",
      countryCode: "QA",
      market: "GCC",
      timezone: "Asia/Qatar",
      currency: "QAR",
      language: "ar",
      locale: "ar-QA",
    },
    confidence: 0.9,
  },
  {
    prefix: "+973",
    hint: {
      country: "Bahrain",
      countryCode: "BH",
      market: "GCC",
      timezone: "Asia/Bahrain",
      currency: "BHD",
      language: "ar",
      locale: "ar-BH",
    },
    confidence: 0.9,
  },
  {
    prefix: "+968",
    hint: {
      country: "Oman",
      countryCode: "OM",
      market: "GCC",
      timezone: "Asia/Muscat",
      currency: "OMR",
      language: "ar",
      locale: "ar-OM",
    },
    confidence: 0.9,
  },
  {
    prefix: "+20",
    hint: {
      country: "Egypt",
      countryCode: "EG",
      market: "MENA",
      timezone: "Africa/Cairo",
      currency: "EGP",
      language: "ar",
      locale: "ar-EG",
    },
    confidence: 0.9,
  },
  {
    prefix: "+962",
    hint: {
      country: "Jordan",
      countryCode: "JO",
      market: "MENA",
      timezone: "Asia/Amman",
      currency: "JOD",
      language: "ar",
      locale: "ar-JO",
    },
    confidence: 0.88,
  },
  {
    prefix: "+961",
    hint: {
      country: "Lebanon",
      countryCode: "LB",
      market: "MENA",
      timezone: "Asia/Beirut",
      currency: "LBP",
      language: "ar",
      locale: "ar-LB",
    },
    confidence: 0.88,
  },
  {
    prefix: "+212",
    hint: {
      country: "Morocco",
      countryCode: "MA",
      market: "MENA",
      timezone: "Africa/Casablanca",
      currency: "MAD",
      language: "ar",
      locale: "ar-MA",
    },
    confidence: 0.88,
  },
  {
    prefix: "+44",
    hint: {
      country: "United Kingdom",
      countryCode: "GB",
      market: "EU",
      timezone: "Europe/London",
      currency: "GBP",
      language: "en",
      locale: "en-GB",
    },
    confidence: 0.88,
  },
  {
    prefix: "+1",
    hint: {
      country: "United States",
      countryCode: "US",
      market: "NA",
      timezone: "America/New_York",
      currency: "USD",
      language: "en",
      locale: "en-US",
    },
    confidence: 0.75,
  },
];

export function countryFromPhone(phone: string | null | undefined): PhoneCountryHint | null {
  if (!phone?.trim()) return null;
  let digits = normalizePhoneDigits(phone.trim());
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+") && /^966\d{8,}$/.test(digits)) digits = `+${digits}`;
  for (const entry of DIAL_MAP) {
    if (digits.startsWith(entry.prefix)) {
      return { ...entry.hint, confidence: entry.confidence };
    }
  }
  return null;
}

export function extractEmails(text: string): string[] {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

export function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+|00)?\d[\d\s\-()]{7,}\d/g) ?? [];
  return [...new Set(matches.map((p) => normalizePhoneDigits(p)).filter((p) => p.replace(/\D/g, "").length >= 8))];
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(matches.map((u) => u.replace(/[.,);]+$/, "")))];
}

export function matchAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function scoreKeywordHits(text: string, patterns: readonly RegExp[]): number {
  let hits = 0;
  for (const p of patterns) {
    if (p.test(text)) hits += 1;
  }
  return hits;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function lastMessagesSummary(messages: readonly ProviderMessage[], maxChars = 280): string {
  const recent = [...messages].slice(-4);
  const parts: string[] = [];
  let used = 0;
  for (const m of recent) {
    const line = String(m.content ?? "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const slice = line.slice(0, Math.max(40, maxChars - used));
    parts.push(slice);
    used += slice.length;
    if (used >= maxChars) break;
  }
  return parts.join(" · ").slice(0, maxChars);
}
