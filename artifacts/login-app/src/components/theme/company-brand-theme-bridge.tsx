import { useLayoutEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/auth-context";
import { useCompanyBrandCenter } from "@/hooks/company-workspace/use-company-brand-center";
import { DEFAULT_BRAND_COLORS } from "@/lib/company-workspace/brand-center/defaults";
import {
  applyBrandTheme,
  applyDefaultBrandTheme,
  clearBrandThemeInlineStyles,
  type BrandThemeMode,
} from "@/lib/theme/brand-theme-service";

function resolveMode(resolvedTheme: string | undefined): BrandThemeMode {
  return resolvedTheme === "dark" ? "dark" : "light";
}

/**
 * Loads company branding from the shared React Query cache and applies CSS variables
 * whenever branding or light/dark mode changes — no full page reload.
 * useLayoutEffect so tokens land before the next paint (shell / chrome).
 *
 * When the user chooses Appearance → System, keep the original stylesheet tokens
 * (index.css :root / .dark) instead of Brand Center overrides.
 */
export function CompanyBrandThemeBridge() {
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const { theme, resolvedTheme } = useTheme();
  const mode = resolveMode(resolvedTheme);
  const { data: brandDocument, isSuccess, isError } = useCompanyBrandCenter(
    companyId,
    Boolean(companyId),
  );

  const colorsFingerprint = useMemo(() => {
    if (!brandDocument?.colors) return null;
    return JSON.stringify(brandDocument.colors);
  }, [brandDocument?.colors]);

  useLayoutEffect(() => {
    // System appearance = original platform chrome from CSS, not Brand Center paint.
    if (theme === "system") {
      document.documentElement.dataset.appearance = "system";
      clearBrandThemeInlineStyles();
      return;
    }

    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.appearance = theme;
    }

    if (!companyId) {
      applyDefaultBrandTheme(mode);
      return;
    }

    if (brandDocument?.colors) {
      applyBrandTheme(brandDocument.colors, mode);
      return;
    }

    // Query pending: keep defaults until branding resolves.
    if (!isSuccess && !isError) {
      applyDefaultBrandTheme(mode);
      return;
    }

    // No branding / error → ValueOR defaults.
    applyBrandTheme(DEFAULT_BRAND_COLORS, mode);
  }, [companyId, colorsFingerprint, brandDocument?.colors, mode, isSuccess, isError, theme]);

  return null;
}
