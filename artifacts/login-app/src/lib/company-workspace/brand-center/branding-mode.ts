import { DEFAULT_BRAND_COLORS } from "./defaults";
import type { CompanyBrandCenterDocument, CompanyBrandColors, CompanyBrandingMode } from "./types";

/** Brand-driving slots used to infer intentional custom branding (not semantic status colors). */
const BRAND_DRIVING_KEYS = [
  "primary",
  "secondary",
  "accent",
  "sidebar",
  "sidebarActive",
  "sidebarAccent",
] as const satisfies ReadonlyArray<keyof CompanyBrandColors>;

export function isCompanyBrandingMode(value: unknown): value is CompanyBrandingMode {
  return value === "official" || value === "custom";
}

export function normalizeHexColor(value: string): string {
  return value.trim().toLowerCase();
}

/** True when brand-driving colors match the official ValueOR palette. */
export function brandDrivingColorsMatchOfficial(colors: CompanyBrandColors): boolean {
  return BRAND_DRIVING_KEYS.every(
    (key) => normalizeHexColor(colors[key]) === normalizeHexColor(DEFAULT_BRAND_COLORS[key]),
  );
}

/**
 * Infer mode for documents that predate brandingMode.
 * Empty / default-looking palettes → official; any intentional brand-driving delta → custom.
 */
export function inferBrandingMode(colors: CompanyBrandColors): CompanyBrandingMode {
  return brandDrivingColorsMatchOfficial(colors) ? "official" : "custom";
}

export function normalizeBrandingMode(
  raw: unknown,
  colors: CompanyBrandColors,
): CompanyBrandingMode {
  if (isCompanyBrandingMode(raw)) return raw;
  return inferBrandingMode(colors);
}

/**
 * Colors that drive the live theme for the company.
 * Official mode always uses the canonical ValueOR palette — stored custom colors stay intact.
 */
export function resolveActiveBrandColors(
  document: Pick<CompanyBrandCenterDocument, "brandingMode" | "colors">,
): CompanyBrandColors {
  if (document.brandingMode === "official") {
    return { ...DEFAULT_BRAND_COLORS };
  }
  return { ...document.colors };
}

export function withBrandingMode(
  document: CompanyBrandCenterDocument,
  brandingMode: CompanyBrandingMode,
): CompanyBrandCenterDocument {
  return { ...document, brandingMode };
}
