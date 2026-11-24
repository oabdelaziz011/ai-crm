import { ar, de, enUS, type Locale } from "date-fns/locale";

/** Resolve date-fns locale for app UI language (en / ar / de). */
export function resolveDateFnsLocale(language: string | null | undefined): Locale {
  const normalized = (language ?? "en").toLowerCase();
  if (normalized.startsWith("ar")) return ar;
  if (normalized.startsWith("de")) return de;
  return enUS;
}
