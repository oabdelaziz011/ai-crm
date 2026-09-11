import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ValueOrLogo } from "@/components/brand/valueor-logo";
import { Button } from "@/components/ui/button";
import { LEGAL_POLICY_LAST_UPDATED } from "@/lib/legal/public-legal-paths";
import {
  cacheAppLanguage,
  isAppLanguage,
  SUPPORTED_APP_LANGUAGES,
  type AppLanguage,
} from "@/lib/i18n/resolve-app-language";
import { cn } from "@/lib/utils";

function formatPolicyDate(language: string): string {
  const locale = language.toLowerCase().startsWith("ar") ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${LEGAL_POLICY_LAST_UPDATED}T12:00:00Z`));
}

function LegalLanguageToggle() {
  const { t, i18n } = useTranslation("common");
  const current: AppLanguage = isAppLanguage(i18n.language) ? i18n.language : "en";

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("legal.language")}>
      {SUPPORTED_APP_LANGUAGES.map((language) => (
        <Button
          key={language}
          type="button"
          size="sm"
          variant={current === language ? "default" : "outline"}
          onClick={() => {
            cacheAppLanguage(language);
            void i18n.changeLanguage(language);
          }}
        >
          {t(`languages.${language}`)}
        </Button>
      ))}
    </div>
  );
}

export function LegalPageLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation("common");
  const updated = formatPolicyDate(i18n.language ?? "en");

  return (
    <div className="auth-canvas relative min-h-screen w-full overflow-x-hidden text-foreground">
      <div className="auth-canvas__grid" aria-hidden />
      <div className="auth-canvas__orb auth-canvas__orb--primary" aria-hidden />
      <div className="auth-canvas__orb auth-canvas__orb--secondary" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:max-w-4xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/login" className="inline-flex justify-center sm:justify-start">
            <span className="sr-only">{t("legal.signIn")}</span>
            <div
              dir="ltr"
              className={cn(
                "flex w-[min(100%,240px)] items-center justify-center rounded-2xl border border-black/5",
                "bg-[#F4F6F8]/95 px-4 py-3 shadow-sm backdrop-blur-sm",
                "dark:border-white/10 dark:bg-[#F4F6F8]",
              )}
            >
              <ValueOrLogo className="w-full max-w-[220px]" />
            </div>
          </Link>
          <LegalLanguageToggle />
        </header>

        <nav
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm sm:justify-start"
          aria-label={t("legal.navLabel")}
        >
          <Link href="/privacy-policy" className="text-primary hover:text-primary/80 font-medium">
            {t("legal.nav.privacy")}
          </Link>
          <Link href="/data-deletion" className="text-primary hover:text-primary/80 font-medium">
            {t("legal.nav.dataDeletion")}
          </Link>
          <Link href="/terms" className="text-primary hover:text-primary/80 font-medium">
            {t("legal.nav.terms")}
          </Link>
          <Link href="/login" className="text-muted-foreground hover:text-foreground font-medium">
            {t("legal.signIn")}
          </Link>
        </nav>

        <article
          className={cn(
            "rounded-2xl border border-white/60 bg-white/90 p-5 shadow-2xl shadow-teal-900/5 backdrop-blur-xl sm:p-8 md:p-10",
            "dark:border-white/10 dark:bg-card/80 dark:shadow-black/40",
          )}
        >
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("legal.lastUpdated", { date: updated })}</p>
          <div className="mt-8 space-y-8 text-sm leading-relaxed sm:text-base">{children}</div>
        </article>
      </div>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{title}</h2>
      <div className="space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 ps-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
