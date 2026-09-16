import { useLayoutEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/auth-context";
import { useCompanyBrandCenter } from "@/hooks/company-workspace/use-company-brand-center";
import { resolveActiveBrandColors } from "@/lib/company-workspace/brand-center/branding-mode";
import { DEFAULT_BRAND_COLORS } from "@/lib/company-workspace/brand-center/defaults";
import {
  applyBrandTheme,
  applyDefaultBrandTheme,
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
 * LIGHT, DARK, and SYSTEM (resolved to light/dark) all use the same brand paint path.
 * System is not a separate visual brand — only an OS-driven light/dark resolver.
 * Theme/sidebar color is never tied to RBAC roles.
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

  const themeFingerprint = useMemo(() => {
    if (!brandDocument) return null;
    const active = resolveActiveBrandColors(brandDocument);
    return JSON.stringify({
      companyId,
      brandingMode: brandDocument.brandingMode,
      colors: active,
    });
  }, [brandDocument, companyId]);

  useLayoutEffect(() => {
    if (theme === "light" || theme === "dark" || theme === "system") {
      document.documentElement.dataset.appearance = theme;
    }

    if (!companyId) {
      applyDefaultBrandTheme(mode);
      return;
    }

    if (brandDocument) {
      applyBrandTheme(resolveActiveBrandColors(brandDocument), mode);
      document.documentElement.dataset.brandingMode = brandDocument.brandingMode;
      return;
    }

    // Query pending: keep ValueOR defaults until branding resolves.
    if (!isSuccess && !isError) {
      applyDefaultBrandTheme(mode);
      return;
    }

    // No branding / error → ValueOR defaults.
    applyBrandTheme(DEFAULT_BRAND_COLORS, mode);
    document.documentElement.dataset.brandingMode = "official";
  }, [companyId, themeFingerprint, brandDocument, mode, isSuccess, isError, theme]);

  return null;
}
