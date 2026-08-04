import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme/resolve-app-theme";
import { usePreferredThemeSync } from "@/lib/theme/use-preferred-theme-sync";

function ThemeSync() {
  usePreferredThemeSync();
  return null;
}

type AppThemeProviderProps = {
  children: ReactNode;
};

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
      {children}
    </NextThemesProvider>
  );
}
