/**
 * Premium login layout — full-bleed green brand canvas + floating auth card.
 * Shell geometry stays LTR; only the form content follows language direction.
 */
import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { Globe, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { i18n as I18nInstance } from "i18next";
import { ValueOrLogo } from "@/components/brand/valueor-logo";
import { LoginProductShowcase } from "@/components/auth/login-product-showcase";
import { LoginDashboardPreview } from "@/components/auth/login-dashboard-preview";
import { Button } from "@/components/ui/button";
import {
  cacheAppLanguage,
  isAppLanguage,
  SUPPORTED_APP_LANGUAGES,
  type AppLanguage,
} from "@/lib/i18n/resolve-app-language";
import { cn } from "@/lib/utils";

const RTL_LANGUAGES = new Set(["ar"]);

/** Keep document chrome LTR on /login so AR↔EN never flips shell geometry/scrollbar. */
function useLoginDocumentLtrLock(i18nInstance: I18nInstance) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const lock = () => {
      const lang = i18nInstance.resolvedLanguage ?? i18nInstance.language ?? "en";
      document.documentElement.dir = "ltr";
      document.body.setAttribute("dir", "ltr");
      document.documentElement.lang = lang;
    };

    lock();
    // i18n.applyDocumentLanguage runs on languageChanged — re-assert after it.
    i18nInstance.on("languageChanged", lock);
    const id = window.setTimeout(lock, 0);

    return () => {
      window.clearTimeout(id);
      i18nInstance.off("languageChanged", lock);
      const lng = i18nInstance.resolvedLanguage ?? i18nInstance.language ?? "en";
      const restoreDir = RTL_LANGUAGES.has(lng) ? "rtl" : "ltr";
      document.documentElement.dir = restoreDir;
      document.body.setAttribute("dir", restoreDir);
    };
  }, [i18nInstance]);
}

function LoginLanguageToggle() {
  const { t, i18n } = useTranslation("common");
  const current: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : "en";

  return (
    <div
      dir="ltr"
      className="inline-flex h-[42px] w-[175px] items-center gap-1.5 rounded-full border border-white/15 bg-black/25 p-1 backdrop-blur-md"
      role="group"
      aria-label={t("legal.language")}
    >
      <Globe className="ms-1.5 size-4 text-teal-200" aria-hidden />
      {SUPPORTED_APP_LANGUAGES.map((language) => {
        const active = current === language;
        return (
          <Button
            key={language}
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 rounded-full px-3.5 text-xs font-semibold shadow-none",
              active
                ? "bg-[#0D9488] text-white hover:bg-[#0f766e] hover:text-white"
                : "bg-transparent text-white/75 hover:bg-white/10 hover:text-white",
            )}
            onClick={() => {
              cacheAppLanguage(language);
              void i18n.changeLanguage(language);
            }}
          >
            {t(`languages.${language}`)}
          </Button>
        );
      })}
    </div>
  );
}

export function LoginExperienceLayout({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle: string;
}) {
  const { t, i18n } = useTranslation("common");
  const formDir = i18n.dir() === "rtl" ? "rtl" : "ltr";
  useLoginDocumentLtrLock(i18n);

  return (
    <div dir="ltr" className="relative min-h-screen w-full overflow-x-hidden">
      {/* Full-page green brand canvas */}
      <div className="absolute inset-0">
        <LoginProductShowcase />
      </div>

      {/* Soft depth behind the card — no hard sidebar edge */}
      <div
        className="pointer-events-none absolute inset-0 hidden lg:block"
        style={{
          background:
            "radial-gradient(ellipse 55% 70% at 78% 48%, rgba(0,0,0,0.28), transparent 62%)",
        }}
        aria-hidden
      />

      {/* Floating login — shell always LTR so card stays in the same place.
          Left column hosts the dashboard in the center “red box” slot. */}
      <div className="pointer-events-none relative z-10 grid min-h-screen w-full grid-cols-1 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="relative hidden min-h-screen lg:block" aria-hidden>
          {/* Brand line sits above the dashboard so it never gets covered */}
          <div
            dir="ltr"
            className="absolute top-[7%] left-[48%] z-20 w-[min(420px,calc(100%-0.5rem))] text-left"
          >
            <p className="text-[15px] font-medium leading-snug text-teal-100/95">
              {t("auth.login.experience.brandStatement")}
            </p>
            <p className="mt-2 font-[cursive] text-sm italic text-teal-300/90">
              {t("auth.login.experience.scriptAccentTop")}
            </p>
          </div>

          {/* Dashboard nudged up a bit — keeps brand line clear, reveals script below */}
          <div className="absolute top-[15.5%] left-[48%] w-[min(640px,calc(100%-0.5rem))]">
            <div
              className="pointer-events-none absolute -inset-10 rounded-full opacity-50 blur-3xl"
              style={{
                background: "radial-gradient(circle, rgba(13,148,136,0.38), transparent 70%)",
              }}
            />
            <LoginDashboardPreview />
            <p className="mt-4 pb-1 text-center font-[cursive] text-sm italic text-teal-300/85">
              {t("auth.login.experience.scriptAccentBottom")}
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10 xl:px-14">
          <aside className="flex w-full max-w-[440px] flex-col">
            <div className="mb-4 flex justify-center lg:mb-5 lg:justify-end">
              <LoginLanguageToggle />
            </div>

            <div
              dir={formDir}
              className="rounded-[1.35rem] border border-white/45 bg-white/97 px-7 py-8 shadow-[0_28px_80px_rgba(0,0,0,0.38)] backdrop-blur-sm sm:px-8 sm:py-9"
            >
              <div className="mb-6 flex flex-col items-center text-center">
                <div dir="ltr" className="mb-5 w-full max-w-[260px]">
                  <ValueOrLogo className="w-full" />
                </div>
                <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight text-slate-900">
                  {t("auth.login.experience.welcomeTitle")}
                </h1>
                <p className="mt-2 text-[15px] text-slate-500">
                  {t("auth.login.experience.welcomeSubtitle", { defaultValue: subtitle })}
                </p>
              </div>

              {children}

              <div
                className="mt-5 flex items-start gap-3 rounded-xl bg-[#EEF6F8] px-4 py-4 text-start"
                role="note"
              >
                <Lock className="mt-0.5 size-4 shrink-0 text-slate-700" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-slate-800">
                    {t("auth.login.experience.securityTitle")}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
                    {t("auth.login.experience.securityBody")}
                  </p>
                </div>
              </div>
            </div>

            <nav
              dir={formDir}
              className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pb-1 text-center text-[13px]"
              aria-label={t("legal.navLabel")}
            >
              <Link
                href="/privacy-policy"
                className="font-medium text-teal-100/90 transition-colors hover:text-white"
              >
                {t("legal.nav.privacy")}
              </Link>
              <span className="text-white/30" aria-hidden>
                |
              </span>
              <Link
                href="/terms"
                className="font-medium text-teal-100/90 transition-colors hover:text-white"
              >
                {t("legal.nav.terms")}
              </Link>
              <span className="text-white/30" aria-hidden>
                |
              </span>
              <Link
                href="/data-deletion"
                className="font-medium text-teal-100/90 transition-colors hover:text-white"
              >
                {t("legal.nav.dataDeletion")}
              </Link>
            </nav>
          </aside>
        </div>
      </div>
    </div>
  );
}
