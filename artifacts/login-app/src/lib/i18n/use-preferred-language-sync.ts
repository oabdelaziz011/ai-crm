import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMyProfile } from "@/hooks/use-my-profile";
import { cacheAppLanguage, resolveAppLanguage } from "@/lib/i18n/resolve-app-language";

/** Synchronize i18n from profile.preferred_language (database authority). */
export function usePreferredLanguageSync() {
  const { i18n } = useTranslation();
  const { data: profile, isSuccess } = useMyProfile();

  useEffect(() => {
    if (!isSuccess) {
      return;
    }

    const resolved = resolveAppLanguage(profile?.preferred_language);
    if (i18n.resolvedLanguage !== resolved) {
      void i18n.changeLanguage(resolved);
    } else {
      cacheAppLanguage(resolved);
    }
  }, [profile?.preferred_language, isSuccess, i18n]);
}
