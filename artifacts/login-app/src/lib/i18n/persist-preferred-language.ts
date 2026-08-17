import { supabase } from "@/lib/supabase";
import {
  cacheAppLanguage,
  isAppLanguage,
  resolveBootstrapAppLanguage,
  type AppLanguage,
} from "@/lib/i18n/resolve-app-language";

type ProfileLanguageRow = {
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  preferred_theme: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
};

async function loadProfileForLanguageUpdate(userId: string): Promise<ProfileLanguageRow | null> {
  // Profile row is created by a trigger after signup — retry briefly so we do not
  // leave preferred_language stuck on the DB default (`en`) and flip the UI.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, timezone, preferred_theme, job_title, department, phone")
      .or(`id.eq.${userId},user_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();
    if (profile) return profile as ProfileLanguageRow;
    await new Promise((resolve) => setTimeout(resolve, 150 + attempt * 100));
  }
  return null;
}

/** Persist the active UI language onto the signed-in profile (DB defaults to en). */
export async function persistPreferredLanguage(language: string | null | undefined): Promise<AppLanguage> {
  const lang: AppLanguage = isAppLanguage(language) ? language : resolveBootstrapAppLanguage();
  cacheAppLanguage(lang);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return lang;

  const profile = await loadProfileForLanguageUpdate(user.id);
  if (!profile) return lang;

  // After migration 295, null p_phone means "leave unchanged" so a language-only
  // sync cannot wipe profiles.phone written by onboard_own_company_v1.
  await supabase.rpc("update_my_profile", {
    p_full_name: profile.full_name?.trim() ?? "",
    p_avatar_url: profile.avatar_url ?? null,
    p_preferred_language: lang,
    p_timezone: profile.timezone ?? "UTC",
    p_preferred_theme: profile.preferred_theme ?? "system",
    p_job_title: profile.job_title ?? null,
    p_department: profile.department ?? null,
    p_phone: profile.phone ?? null,
  });

  return lang;
}
