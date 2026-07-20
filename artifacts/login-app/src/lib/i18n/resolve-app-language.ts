export const LANGUAGE_STORAGE_KEY = "app.language";

export const SUPPORTED_APP_LANGUAGES = ["en", "ar"] as const;

export type AppLanguage = (typeof SUPPORTED_APP_LANGUAGES)[number];

export const DEFAULT_APP_LANGUAGE: AppLanguage = "ar";

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === "en" || value === "ar";
}

export function readCachedAppLanguage(): AppLanguage | null {
  if (typeof window === "undefined") {
    return null;
  }
  const cached = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isAppLanguage(cached) ? cached : null;
}

export function readBrowserAppLanguage(): AppLanguage | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  const primary = navigator.language?.toLowerCase() ?? "";
  if (primary.startsWith("ar")) {
    return "ar";
  }
  if (primary.startsWith("en")) {
    return "en";
  }
  return null;
}

/**
 * Resolve the active UI language.
 * Authority: profile DB → localStorage cache → browser → default.
 */
export function resolveAppLanguage(profilePreferredLanguage: string | null | undefined): AppLanguage {
  if (isAppLanguage(profilePreferredLanguage)) {
    return profilePreferredLanguage;
  }
  const cached = readCachedAppLanguage();
  if (cached) {
    return cached;
  }
  const browser = readBrowserAppLanguage();
  if (browser) {
    return browser;
  }
  return DEFAULT_APP_LANGUAGE;
}

/** Bootstrap language before profile is available (login / first paint). */
export function resolveBootstrapAppLanguage(): AppLanguage {
  return resolveAppLanguage(null);
}

export function cacheAppLanguage(language: AppLanguage): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}
