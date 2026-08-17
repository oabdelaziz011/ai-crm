import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "@/context/auth-context";
import { cacheAppLanguage, resolveAppLanguage } from "@/lib/i18n/resolve-app-language";

/** Synchronize i18n from profile.preferred_language (database authority). */
export function usePreferredLanguageSync() {
  const { i18n } = useTranslation();
  const { profile } = useUser();

  useEffect(() => {
    if (!profile) {
      return;
    }

    const resolved = resolveAppLanguage(profile.preferred_language);
    if (i18n.resolvedLanguage !== resolved) {
      void i18n.changeLanguage(resolved);
    }
    cacheAppLanguage(resolved);
  }, [profile?.preferred_language, profile, i18n]);
}
