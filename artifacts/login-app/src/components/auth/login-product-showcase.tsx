/**
 * Left product panel — full-bleed brand experience behind the floating login card.
 * Layout geometry stays LTR so AR↔EN only changes copy, not element positions.
 * Dashboard preview is absolutely placed in the center “hero slot” (between copy and login).
 */
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  Filter,
  Hospital,
  LandPlot,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Send,
  Shield,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { ValueOrLogo } from "@/components/brand/valueor-logo";
import { cn } from "@/lib/utils";

const FEATURE_CARDS = [
  { icon: Users, titleKey: "customersTitle", bodyKey: "customersBody" },
  { icon: Filter, titleKey: "leadsTitle", bodyKey: "leadsBody" },
  { icon: Bot, titleKey: "automationTitle", bodyKey: "automationBody" },
  { icon: Megaphone, titleKey: "campaignsTitle", bodyKey: "campaignsBody" },
] as const;

const CHANNELS = [
  { key: "whatsapp", icon: MessageCircle, className: "bg-[#25D366] text-white" },
  {
    key: "instagram",
    icon: Send,
    className: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white",
  },
  { key: "messenger", icon: MessageSquare, className: "bg-[#0084FF] text-white" },
  { key: "email", icon: Mail, className: "bg-[#0D9488] text-white" },
  { key: "sms", icon: MessageSquare, className: "bg-sky-500 text-white" },
] as const;

const TRUST_ITEMS = [
  { icon: BarChart3, key: "reports" as const },
  { icon: Sparkles, key: "ai" as const },
  { icon: Shield, key: "security" as const },
] as const;

const BUSINESS_TYPES = [
  { icon: Hospital, key: "clinics" as const },
  { icon: Briefcase, key: "serviceOffices" as const },
  { icon: Building2, key: "companies" as const },
  { icon: LandPlot, key: "centers" as const },
  { icon: Store, key: "commerce" as const },
  { icon: MoreHorizontal, key: "other" as const },
] as const;

export function LoginProductShowcase({ className }: { className?: string }) {
  const { t, i18n } = useTranslation("common");
  // Bidi for Arabic glyphs only — physical alignment stays LTR so boxes don't jump.
  const copyDir = i18n.dir() === "rtl" ? "rtl" : "ltr";

  return (
    <section
      dir="ltr"
      className={cn(
        "relative flex h-full min-h-screen flex-col overflow-hidden text-white",
        className,
      )}
      aria-label={t("auth.login.experience.showcaseAria")}
      style={{
        background:
          "linear-gradient(155deg, #031a1c 0%, #062a2c 28%, #0a3d3a 55%, #0b2e2b 78%, #041c1b 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 42% 38%, rgba(13,148,136,0.34), transparent 68%), radial-gradient(ellipse 40% 35% at 18% 82%, rgba(45,212,191,0.12), transparent 65%), radial-gradient(ellipse 45% 40% at 88% 70%, rgba(13,148,136,0.18), transparent 70%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
        aria-hidden
      />

      {/* Left copy column only — dashboard lives in the center slot of the login overlay */}
      <div className="relative z-10 flex h-screen min-h-0 flex-1 flex-col overflow-hidden px-8 py-8 sm:px-10 lg:max-w-[46%] lg:px-12 lg:py-9 xl:px-14">
        <header className="relative z-20 mb-5 flex h-[80px] shrink-0 items-start overflow-hidden">
          <div dir="ltr" className="w-[236px] shrink-0">
            <div className="origin-top-left scale-[1.48]">
              <ValueOrLogo tone="onDark" />
            </div>
            <p className="mt-3.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
              {t("auth.login.experience.brandTagline")}
            </p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-w-0 space-y-4">
            <div
              dir={copyDir}
              className="max-w-[440px] min-h-[140px] space-y-3 text-left xl:min-h-[156px]"
            >
              <h2 className="max-w-[16ch] text-[2.25rem] font-extrabold leading-[1.08] tracking-tight xl:text-[2.65rem]">
                <span className="bg-gradient-to-b from-white via-white to-teal-300 bg-clip-text text-transparent">
                  {t("auth.login.experience.headline")}
                </span>
              </h2>
              <p className="line-clamp-3 max-w-[420px] text-[14px] leading-[1.6] text-white/75 xl:text-[15px]">
                {t("auth.login.experience.supporting")}
              </p>
            </div>

            <div className="grid max-w-[440px] grid-cols-1 gap-3 sm:grid-cols-2">
              {FEATURE_CARDS.map(({ icon: Icon, titleKey, bodyKey }) => (
                <div
                  key={titleKey}
                  className="flex h-[112px] flex-col overflow-hidden rounded-2xl border border-teal-400/25 bg-white/[0.05] p-3.5 shadow-[0_0_0_1px_rgba(13,148,136,0.08)] backdrop-blur-sm"
                >
                  <div className="mb-2 flex size-8 shrink-0 items-center justify-center rounded-xl bg-teal-400/15 text-teal-200">
                    <Icon className="size-4" aria-hidden strokeWidth={1.75} />
                  </div>
                  <div dir={copyDir} className="min-h-0 text-left">
                    <p className="truncate text-[14px] font-semibold text-white">
                      {t(`auth.login.experience.cards.${titleKey}`)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.4] text-white/60">
                      {t(`auth.login.experience.cards.${bodyKey}`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div
              dir="ltr"
              className="flex max-w-[440px] flex-wrap items-center gap-x-3 gap-y-2"
              aria-label={t("auth.login.experience.channelsAria")}
            >
              {CHANNELS.map(({ key, icon: Icon, className: badgeClass }) => (
                <div
                  key={key}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/25 py-1.5 pe-3 ps-1.5"
                >
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full shadow-sm",
                      badgeClass,
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden strokeWidth={2} />
                  </span>
                  <span className="whitespace-nowrap text-[12px] font-medium text-white/85">
                    {t(`auth.login.experience.channels.${key}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <footer className="mt-auto shrink-0 space-y-4 border-t border-white/10 pt-4">
            <div>
              <p dir={copyDir} className="mb-3 text-left text-[12px] font-medium text-white/55">
                {t("auth.login.experience.businessTypesTitle")}
              </p>
              <ul dir="ltr" className="flex h-[32px] flex-nowrap items-center gap-2.5 overflow-hidden">
                {BUSINESS_TYPES.map(({ icon: Icon, key }) => (
                  <li
                    key={key}
                    className="flex shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[12px] text-white/80 backdrop-blur-sm"
                  >
                    <Icon className="size-4 text-teal-200/90" aria-hidden strokeWidth={1.6} />
                    <span dir={copyDir} className="whitespace-nowrap">
                      {t(`auth.login.experience.businessTypes.${key}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <ul dir="ltr" className="flex h-[40px] flex-nowrap items-center gap-x-5 overflow-hidden">
              {TRUST_ITEMS.map(({ icon: Icon, key }) => (
                <li key={key} className="flex shrink-0 items-center gap-2 text-[12px] text-white/70">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-400/15 text-teal-200">
                    <Icon className="size-3.5" aria-hidden strokeWidth={1.75} />
                  </span>
                  <span dir={copyDir} className="max-w-[180px] truncate text-left leading-snug">
                    {t(`auth.login.experience.trust.${key}`)}
                  </span>
                </li>
              ))}
            </ul>
          </footer>
        </div>
      </div>
    </section>
  );
}
