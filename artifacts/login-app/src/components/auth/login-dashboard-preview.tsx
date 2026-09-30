/**
 * Illustrative product preview for the login experience panel.
 * Static UI only — no live data, no dashboard routes, no backend calls.
 */
import { useTranslation } from "react-i18next";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Target,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: LayoutDashboard, key: "dashboard" as const, active: true },
  { icon: Users, key: "customers" as const, active: false },
  { icon: Target, key: "leads" as const, active: false },
  { icon: MessageSquare, key: "conversations" as const, active: false },
  { icon: Ticket, key: "tickets" as const, active: false },
  { icon: Megaphone, key: "campaigns" as const, active: false },
  { icon: Workflow, key: "automation" as const, active: false },
  { icon: Bot, key: "aiEmployees" as const, active: false },
  { icon: BarChart3, key: "reports" as const, active: false },
] as const;

const FLOW_STEPS = ["inbound", "automation", "decision", "action", "reply"] as const;

const METRICS = [
  {
    key: "leads" as const,
    value: "128",
    delta: "+18%",
    up: true,
    icon: Target,
    accent: "bg-sky-500/15 text-sky-300",
  },
  {
    key: "customers" as const,
    value: "1.2k",
    delta: "+9%",
    up: true,
    icon: Users,
    accent: "bg-teal-500/15 text-teal-300",
  },
  {
    key: "tickets" as const,
    value: "34",
    delta: "-6%",
    up: false,
    icon: Ticket,
    accent: "bg-amber-500/15 text-amber-300",
  },
  {
    key: "revenue" as const,
    value: "$48k",
    delta: "+14%",
    up: true,
    icon: TrendingUp,
    accent: "bg-emerald-500/15 text-emerald-300",
  },
] as const;

const ACTIVITY = [
  { icon: MessageSquare, key: "whatsapp" as const, time: "2m", tone: "bg-emerald-500/15 text-emerald-300" },
  { icon: UserPlus, key: "lead" as const, time: "14m", tone: "bg-sky-500/15 text-sky-300" },
  { icon: CheckCircle2, key: "ticket" as const, time: "1h", tone: "bg-teal-500/15 text-teal-300" },
  { icon: Megaphone, key: "campaign" as const, time: "3h", tone: "bg-violet-500/15 text-violet-300" },
] as const;

const CHANNEL_MIX = [
  { key: "whatsapp" as const, pct: 42, color: "bg-[#25D366]" },
  { key: "email" as const, pct: 28, color: "bg-teal-400" },
  { key: "sms" as const, pct: 18, color: "bg-sky-400" },
  { key: "other" as const, pct: 12, color: "bg-white/30" },
] as const;

export function LoginDashboardPreview() {
  const { t } = useTranslation("common");

  return (
    <div
      dir="ltr"
      className="pointer-events-none relative w-full max-w-[640px] select-none"
      aria-hidden
    >
      <div
        className="overflow-hidden rounded-2xl border border-white/20 bg-[#0A1C20]/96 shadow-[0_32px_90px_rgba(0,0,0,0.55)] backdrop-blur-md"
        style={{ transform: "perspective(1400px) rotateY(-3.5deg) rotateX(1.1deg)" }}
      >
        <div className="flex h-[580px] overflow-hidden xl:h-[620px]">
          <aside className="hidden w-[158px] shrink-0 border-e border-white/10 bg-[#061214] p-3.5 sm:block">
            <p className="mb-4 truncate px-1.5 text-[12px] font-bold tracking-wide text-teal-300">
              ValueOR
            </p>
            <ul className="space-y-0.5">
              {NAV_ITEMS.map(({ icon: Icon, key, active }) => (
                <li
                  key={key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px]",
                    active
                      ? "bg-[#0D9488] font-medium text-white shadow-sm shadow-teal-900/40"
                      : "text-white/60",
                  )}
                >
                  <Icon className="size-3.5 shrink-0 opacity-90" strokeWidth={1.75} />
                  <span className="truncate">{t(`auth.login.experience.preview.nav.${key}`)}</span>
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[16px] font-semibold tracking-tight text-white">
                  {t("auth.login.experience.preview.greeting")}
                </p>
                <p className="mt-0.5 text-[11px] text-white/50">
                  {t("auth.login.experience.preview.subtitle")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-teal-400/25 bg-gradient-to-br from-teal-500/20 to-teal-500/5 px-3 py-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-teal-400/20 text-teal-200">
                  <TrendingUp className="size-4" strokeWidth={2} />
                </span>
                <div className="text-start">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-teal-200/75">
                    {t("auth.login.experience.preview.metrics.conversion")}
                  </p>
                  <p className="text-base font-bold tabular-nums leading-none text-teal-200">
                    24%
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              {METRICS.map(({ key, value, delta, up, icon: Icon, accent }) => (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-lg",
                        accent,
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={2} />
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums",
                        up
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300",
                      )}
                    >
                      {up ? (
                        <ArrowUpRight className="size-2.5" strokeWidth={2.5} />
                      ) : (
                        <ArrowDownRight className="size-2.5" strokeWidth={2.5} />
                      )}
                      {delta}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[10px] leading-tight text-white/50">
                    {t(`auth.login.experience.preview.metrics.${key}`)}
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-teal-400/25 bg-gradient-to-r from-teal-500/15 via-teal-500/8 to-transparent p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-teal-100">
                  {t("auth.login.experience.preview.flowTitle")}
                </p>
                <span className="rounded-full bg-teal-400/15 px-2 py-0.5 text-[9px] font-medium text-teal-200/90">
                  {t("auth.login.experience.preview.liveBadge")}
                </span>
              </div>
              <ol className="flex flex-wrap items-center gap-1.5">
                {FLOW_STEPS.map((step, index) => (
                  <li key={step} className="flex items-center gap-1.5">
                    <span className="rounded-md border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-white/90">
                      {t(`auth.login.experience.preview.flow.${step}`)}
                    </span>
                    {index < FLOW_STEPS.length - 1 ? (
                      <span className="text-[11px] text-teal-300/90" aria-hidden>
                        →
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[1.15fr_0.85fr] gap-2.5">
              <div className="flex min-h-0 flex-col gap-2.5">
                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-white/70">
                      {t("auth.login.experience.preview.charts.pipeline")}
                    </p>
                    <p className="text-[10px] font-medium tabular-nums text-teal-300">+12%</p>
                  </div>
                  <div className="flex min-h-[88px] flex-1 items-end gap-1.5">
                    {[38, 58, 44, 72, 50, 68, 55, 82, 64, 90].map((h, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-t-sm bg-gradient-to-t from-teal-500/50 to-teal-300/90"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="mb-2 text-[11px] font-semibold text-white/70">
                    {t("auth.login.experience.preview.charts.channels")}
                  </p>
                  <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-white/10">
                    {CHANNEL_MIX.map(({ key, pct, color }) => (
                      <span key={key} className={cn("h-full", color)} style={{ width: `${pct}%` }} />
                    ))}
                  </div>
                  <ul className="flex flex-wrap gap-x-3 gap-y-1">
                    {CHANNEL_MIX.map(({ key, pct, color }) => (
                      <li key={key} className="flex items-center gap-1.5 text-[10px] text-white/65">
                        <span className={cn("size-1.5 rounded-full", color)} />
                        <span>{t(`auth.login.experience.preview.channelMix.${key}`)}</span>
                        <span className="tabular-nums text-white/40">{pct}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="mb-2.5 text-[11px] font-semibold text-white/70">
                  {t("auth.login.experience.preview.activityTitle")}
                </p>
                <ul className="flex min-h-0 flex-1 flex-col justify-between gap-2">
                  {ACTIVITY.map(({ icon: Icon, key, time, tone }) => (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5"
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md",
                          tone,
                        )}
                      >
                        <Icon className="size-3" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[10px] text-white/85">
                        {t(`auth.login.experience.preview.activity.${key}`)}
                      </span>
                      <span className="shrink-0 text-[9px] tabular-nums text-white/40">{time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
