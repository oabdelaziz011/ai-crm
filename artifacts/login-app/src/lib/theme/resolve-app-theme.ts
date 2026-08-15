export const THEME_STORAGE_KEY = "app.theme";

export const APP_THEMES = ["system", "light", "dark"] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export const DEFAULT_APP_THEME: AppTheme = "system";

export function isAppTheme(value: string | null | undefined): value is AppTheme {
  return value === "system" || value === "light" || value === "dark";
}

export function readCachedAppTheme(): AppTheme | null {
  if (typeof window === "undefined") {
    return null;
  }
  const cached = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isAppTheme(cached) ? cached : null;
}

/**
 * Resolve the active theme preference.
 * Authority: profile DB → localStorage cache → default (system).
 */
export function resolveAppTheme(profilePreferredTheme: string | null | undefined): AppTheme {
  if (isAppTheme(profilePreferredTheme)) {
    return profilePreferredTheme;
  }
  const cached = readCachedAppTheme();
  if (cached) {
    return cached;
  }
  return DEFAULT_APP_THEME;
}

/** Bootstrap theme before profile is available (login / first paint). */
export function resolveBootstrapAppTheme(): AppTheme {
  return resolveAppTheme(null);
}

export function cacheAppTheme(theme: AppTheme): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.documentElement.dataset.appearance = theme;
}

/** True when Appearance preference is System (platform stylesheet, no Brand Center paint). */
export function isPlatformAppearanceActive(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (document.documentElement.dataset.appearance === "system") {
    return true;
  }
  return readCachedAppTheme() === "system";
}

export function readSystemPrefersDark(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveEffectiveTheme(theme: AppTheme): "light" | "dark" {
  if (theme === "dark") {
    return "dark";
  }
  if (theme === "light") {
    return "light";
  }
  return readSystemPrefersDark() ? "dark" : "light";
}
