import { getCompanyIntlLocale, resolveIntlLocale } from "@/lib/company-locale/runtime";

/** WhatsApp interactive list row title hard limit. */
export const WHATSAPP_LIST_ROW_TITLE_MAX = 24;

export function truncateWhatsAppListTitle(value: string): string {
  const chars = Array.from(value.trim());
  if (chars.length <= WHATSAPP_LIST_ROW_TITLE_MAX) return value.trim();
  return `${chars.slice(0, WHATSAPP_LIST_ROW_TITLE_MAX - 1).join("")}…`;
}

/**
 * Resolve display locale for scheduling WhatsApp lists.
 * Prefer explicit language, then company runtime, then MENA timezone → Arabic.
 */
export function resolveSchedulingDisplayLocale(input?: {
  language?: string | null;
  timezone?: string | null;
}): string {
  const explicit = input?.language?.trim();
  if (explicit) return resolveIntlLocale(explicit);

  const runtime = getCompanyIntlLocale()?.trim();
  if (runtime && runtime !== "en" && runtime !== "en-US") return runtime;

  const timezone = (input?.timezone ?? "").toLowerCase();
  if (
    timezone.includes("cairo") ||
    timezone.includes("riyadh") ||
    timezone.includes("dubai") ||
    timezone.includes("kuwait") ||
    timezone.includes("qatar") ||
    timezone.includes("amman") ||
    timezone.includes("beirut") ||
    timezone.startsWith("africa/") ||
    timezone.startsWith("asia/riyadh") ||
    timezone.startsWith("asia/dubai")
  ) {
    return "ar-EG";
  }

  return runtime || "en-US";
}

export function isArabicSchedulingLocale(locale: string): boolean {
  return locale.toLowerCase().startsWith("ar");
}
