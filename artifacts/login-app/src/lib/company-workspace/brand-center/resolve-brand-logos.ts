import type { CompanyBrandLogos } from "./types";

export type ResolvedBrandLogos = Readonly<{
  primary: string | null;
  dark: string | null;
  light: string | null;
  square: string | null;
  invoice: string | null;
  email: string | null;
  /** True when the resolved URL came from primary fallback. */
  usingPrimaryFallback: Readonly<{
    dark: boolean;
    light: boolean;
    square: boolean;
    invoice: boolean;
    email: boolean;
  }>;
}>;

/** Resolve every logo slot with Primary Logo fallback. Never returns a broken empty when primary exists. */
export function resolveBrandLogos(
  logos: Partial<CompanyBrandLogos> | null | undefined,
  primaryFallback: string | null = null,
): ResolvedBrandLogos {
  const primary = logos?.main?.trim() || primaryFallback?.trim() || null;
  const darkRaw = logos?.dark?.trim() || null;
  const lightRaw = logos?.light?.trim() || null;
  const squareRaw = logos?.square?.trim() || null;
  const invoiceRaw = logos?.invoice?.trim() || null;
  const emailRaw = logos?.email?.trim() || null;

  return {
    primary,
    dark: darkRaw || primary,
    light: lightRaw || primary,
    square: squareRaw || primary,
    invoice: invoiceRaw || primary,
    email: emailRaw || primary,
    usingPrimaryFallback: {
      dark: !darkRaw && Boolean(primary),
      light: !lightRaw && Boolean(primary),
      square: !squareRaw && Boolean(primary),
      invoice: !invoiceRaw && Boolean(primary),
      email: !emailRaw && Boolean(primary),
    },
  };
}

export function pickChromeLogo(
  resolved: ResolvedBrandLogos,
  options: { theme?: "light" | "dark" | "system"; collapsed?: boolean; mobile?: boolean },
): string | null {
  if (options.collapsed || options.mobile) return resolved.square;
  if (options.theme === "dark") return resolved.dark;
  return resolved.light || resolved.primary;
}
