import { DEFAULT_BRAND_COLORS } from "@/lib/company-workspace/brand-center/defaults";
import type { CompanyBrandColors } from "@/lib/company-workspace/brand-center/types";
import {
  contrastForeground,
  hexToHsl,
  hslToCssChannels,
  withLightness,
  withSaturation,
  type HslChannels,
} from "@/lib/theme/hex-to-hsl";

export type BrandThemeMode = "light" | "dark";

const BRAND_STYLE_KEYS = [
  "--primary",
  "--primary-foreground",
  "--primary-border",
  "--secondary",
  "--secondary-foreground",
  "--secondary-border",
  "--accent",
  "--accent-foreground",
  "--accent-border",
  "--success",
  "--warning",
  "--destructive",
  "--destructive-foreground",
  "--destructive-border",
  "--background",
  "--foreground",
  "--surface",
  "--card",
  "--card-foreground",
  "--card-border",
  "--popover",
  "--popover-foreground",
  "--popover-border",
  "--border",
  "--input",
  "--muted",
  "--muted-foreground",
  "--muted-border",
  "--ring",
  "--sidebar",
  "--sidebar-background",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-primary-border",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
  "--chart-1",
] as const;

function resolveColor(value: string | undefined, fallback: string): HslChannels {
  return hexToHsl(value || "") ?? hexToHsl(fallback) ?? { h: 187, s: 85, l: 38 };
}

function channels(hsl: HslChannels): string {
  return hslToCssChannels(hsl);
}

/**
 * Map Brand Center colors → shadcn CSS variables for the active light/dark mode.
 * Values are written on `document.documentElement` so existing Tailwind tokens update live.
 */
export function buildBrandThemeCssVariables(
  colors: Partial<CompanyBrandColors> | null | undefined,
  mode: BrandThemeMode,
): Record<string, string> {
  const palette: CompanyBrandColors = {
    ...DEFAULT_BRAND_COLORS,
    ...Object.fromEntries(
      Object.entries(colors ?? {}).filter(([, v]) => typeof v === "string" && v.trim()),
    ),
  };

  const primary = resolveColor(palette.primary, DEFAULT_BRAND_COLORS.primary);
  const secondary = resolveColor(palette.secondary, DEFAULT_BRAND_COLORS.secondary);
  const accent = resolveColor(palette.accent, DEFAULT_BRAND_COLORS.accent);
  const success = resolveColor(palette.success, DEFAULT_BRAND_COLORS.success);
  const warning = resolveColor(palette.warning, DEFAULT_BRAND_COLORS.warning);
  const danger = resolveColor(palette.danger, DEFAULT_BRAND_COLORS.danger);
  const background = resolveColor(palette.background, DEFAULT_BRAND_COLORS.background);
  const surface = resolveColor(palette.surface, DEFAULT_BRAND_COLORS.surface);

  if (mode === "dark") {
    const darkPrimary = withLightness(primary, Math.max(primary.l, 48));
    const darkAccent = withLightness(accent, Math.max(accent.l, 45));
    const darkSuccess = withLightness(success, Math.max(success.l, 42));
    const darkWarning = withLightness(warning, Math.max(warning.l, 48));
    const darkDanger = withLightness(danger, Math.max(danger.l, 52));
    const darkBg = withLightness(withSaturation(secondary, Math.min(secondary.s, 40)), 6);
    const darkCard = withLightness(withSaturation(secondary, Math.min(secondary.s, 38)), 10);
    const darkMuted = withLightness(withSaturation(secondary, Math.min(secondary.s, 30)), 13);
    const darkBorder = withLightness(withSaturation(secondary, Math.min(secondary.s, 28)), 16);
    const darkSidebar = withLightness(withSaturation(secondary, Math.min(secondary.s, 44)), 8);
    const darkSidebarAccent = withLightness(darkSidebar, 14);

    return {
      "--primary": channels(darkPrimary),
      "--primary-foreground": contrastForeground(darkPrimary),
      "--primary-border": `hsl(${channels(darkPrimary)})`,
      "--secondary": channels(darkMuted),
      "--secondary-foreground": "210 25% 92%",
      "--secondary-border": `hsl(${channels(darkBorder)})`,
      "--accent": channels(darkSidebarAccent),
      "--accent-foreground": "210 25% 96%",
      "--accent-border": `hsl(${channels(darkBorder)})`,
      "--success": channels(darkSuccess),
      "--warning": channels(darkWarning),
      "--destructive": channels(darkDanger),
      "--destructive-foreground": contrastForeground(darkDanger),
      "--destructive-border": `hsl(${channels(darkDanger)})`,
      "--background": channels(darkBg),
      "--foreground": "210 25% 96%",
      "--surface": channels(darkCard),
      "--card": channels(darkCard),
      "--card-foreground": "210 25% 96%",
      "--card-border": channels(darkBorder),
      "--popover": channels(darkCard),
      "--popover-foreground": "210 25% 96%",
      "--popover-border": channels(darkBorder),
      "--border": channels(darkBorder),
      "--input": channels(darkBorder),
      "--muted": channels(darkMuted),
      "--muted-foreground": "215 14% 58%",
      "--muted-border": `hsl(${channels(darkBorder)})`,
      "--ring": channels(darkPrimary),
      "--sidebar": channels(darkSidebar),
      "--sidebar-background": channels(darkSidebar),
      "--sidebar-foreground": "210 20% 88%",
      "--sidebar-primary": channels(darkPrimary),
      "--sidebar-primary-foreground": contrastForeground(darkPrimary),
      "--sidebar-primary-border": `hsl(${channels(darkPrimary)})`,
      "--sidebar-accent": channels(darkSidebarAccent),
      "--sidebar-accent-foreground": "210 25% 96%",
      "--sidebar-border": channels(darkBorder),
      "--sidebar-ring": channels(darkPrimary),
      "--chart-1": channels(darkPrimary),
    };
  }

  const muted = withLightness(background, Math.max(background.l - 4, 90));
  const border = withLightness(withSaturation(background, Math.min(background.s, 24)), Math.min(background.l - 8, 88));
  const sidebarBg = withLightness(background, Math.max(background.l - 2, 94));
  const sidebarAccent = withLightness(background, Math.max(background.l - 5, 90));
  // Brand secondary is often a deep brand color — use for sidebar primary / secondary token.
  const secondaryUi = withLightness(withSaturation(secondary, Math.min(secondary.s, 20)), 93);
  const accentUi = withLightness(withSaturation(accent, Math.min(accent.s, 30)), 92);

  return {
    "--primary": channels(primary),
    "--primary-foreground": contrastForeground(primary),
    "--primary-border": `hsl(${channels(primary)})`,
    "--secondary": channels(secondaryUi),
    "--secondary-foreground": channels(withLightness(secondary, 18)),
    "--secondary-border": `hsl(${channels(border)})`,
    "--accent": channels(accentUi),
    "--accent-foreground": channels(withLightness(secondary, 11)),
    "--accent-border": `hsl(${channels(border)})`,
    "--success": channels(success),
    "--warning": channels(warning),
    "--destructive": channels(danger),
    "--destructive-foreground": contrastForeground(danger),
    "--destructive-border": `hsl(${channels(danger)})`,
    "--background": channels(background),
    "--foreground": channels(withLightness(secondary, 11)),
    "--surface": channels(surface),
    "--card": channels(surface),
    "--card-foreground": channels(withLightness(secondary, 11)),
    "--card-border": channels(border),
    "--popover": channels(surface),
    "--popover-foreground": channels(withLightness(secondary, 11)),
    "--popover-border": channels(border),
    "--border": channels(border),
    "--input": channels(border),
    "--muted": channels(muted),
    "--muted-foreground": "215 16% 40%",
    "--muted-border": `hsl(${channels(border)})`,
    "--ring": channels(primary),
    "--sidebar": channels(sidebarBg),
    "--sidebar-background": channels(sidebarBg),
    "--sidebar-foreground": channels(withLightness(secondary, 18)),
    "--sidebar-primary": channels(primary),
    "--sidebar-primary-foreground": contrastForeground(primary),
    "--sidebar-primary-border": `hsl(${channels(primary)})`,
    "--sidebar-accent": channels(sidebarAccent),
    "--sidebar-accent-foreground": channels(withLightness(secondary, 11)),
    "--sidebar-border": channels(border),
    "--sidebar-ring": channels(primary),
    "--chart-1": channels(primary),
  };
}

/** Apply company branding to the document root. Safe to call repeatedly. */
export function applyBrandTheme(
  colors: Partial<CompanyBrandColors> | null | undefined,
  mode: BrandThemeMode = "light",
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const tokens = buildBrandThemeCssVariables(colors, mode);
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
  root.dataset.brandTheme = mode;
}

/** Reset to ValueOR defaults for the active mode. */
export function applyDefaultBrandTheme(mode: BrandThemeMode = "light"): void {
  applyBrandTheme(DEFAULT_BRAND_COLORS, mode);
}

/** Remove inline brand overrides (falls back to stylesheet :root / .dark). */
export function clearBrandThemeInlineStyles(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const key of BRAND_STYLE_KEYS) {
    root.style.removeProperty(key);
  }
  delete root.dataset.brandTheme;
}
