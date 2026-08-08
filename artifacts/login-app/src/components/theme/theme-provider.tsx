import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { CompanyBrandThemeBridge } from "@/components/theme/company-brand-theme-bridge";
import { THEME_STORAGE_KEY } from "@/lib/theme/resolve-app-theme";
import { usePreferredThemeSync } from "@/lib/theme/use-preferred-theme-sync";

function ThemeSync() {
  usePreferredThemeSync();
  return null;
}

type AppThemeProviderProps = {
  children: ReactNode;
};

/**
 * Light / dark / system (next-themes) + company Brand Center colors (CSS variables).
 * Brand bridge must sit under AuthProvider (see App.tsx) to read company id + branding cache.
 */
export function AppThemeProvider({ children }: AppThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
    >
      <ThemeSync />
      <CompanyBrandThemeBridge />
      {children}
    </NextThemesProvider>
  );
}
