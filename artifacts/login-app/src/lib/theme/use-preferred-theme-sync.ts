import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useUser } from "@/context/auth-context";
import { cacheAppTheme, resolveAppTheme } from "@/lib/theme/resolve-app-theme";

/** Synchronize next-themes from profile.preferred_theme (database authority). */
export function usePreferredThemeSync() {
  const { setTheme, theme } = useTheme();
  const { profile } = useUser();

  useEffect(() => {
    if (!profile) {
      return;
    }

    const resolved = resolveAppTheme(profile.preferred_theme);
    cacheAppTheme(resolved);
    if (theme !== resolved) {
      setTheme(resolved);
    }
  }, [profile?.preferred_theme, profile, setTheme, theme]);
}
