import type { ReactNode } from "react";
import { AlertTriangle, Clock3, CreditCard, Lock, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { formatLocalizedDate } from "@/lib/billing/billing-display-i18n";
import {
  canOpenSubscriptionPaySurface,
  resolveSubscriptionPayHref,
} from "@/lib/dashboard/resolve-subscription-pay-href";
import type { SubscriptionPaymentNoticeModel } from "@/lib/dashboard/resolve-subscription-payment-notice";
import { cn } from "@/lib/utils";

type Props = {
  model: SubscriptionPaymentNoticeModel;
  /** Inline pay surface (Visa / enabled methods) — admin-only; omit for view-only. */
  paymentPanel?: ReactNode;
  access?: {
    isSuperAdmin: boolean;
    hasPermission: (code: string) => boolean;
  };
};

const urgencyStyles: Record<
  SubscriptionPaymentNoticeModel["urgency"],
  { shell: string; icon: string; badge: string }
> = {
  normal: {
    shell: "border-sky-500/25 bg-sky-500/10 text-sky-950 dark:text-sky-50",
    icon: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    badge: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  },
  soon: {
    shell: "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-50",
    icon: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    badge: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  },
  critical: {
    shell: "border-orange-500/40 bg-orange-500/10 text-orange-950 dark:text-orange-50",
    icon: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    badge: "bg-orange-500/15 text-orange-900 dark:text-orange-100",
  },
  blocked: {
    shell: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: "bg-destructive/15 text-destructive",
    badge: "bg-destructive/15 text-destructive",
  },
};

/**
 * Company-admin-only subscription payment highlight.
 * Soft phases keep the workspace open; locked mirrors Suspended messaging.
 * When `paymentPanel` is provided, Visa / other methods render under the notice
 * so admins can pay without leaving the home dashboard.
 */
export function DashboardSubscriptionPaymentBanner({ model, paymentPanel, access }: Props) {
  const { t, i18n } = useTranslation("common");
  const styles = urgencyStyles[model.urgency];
  const dueLabel = model.dueAt ? formatLocalizedDate(model.dueAt, i18n.language) : null;
  const hasInlinePay = Boolean(paymentPanel) && model.showPayCta;
  const payHref =
    access && canOpenSubscriptionPaySurface(access)
      ? resolveSubscriptionPayHref(access)
      : resolveSubscriptionPayHref({ isSuperAdmin: false, hasPermission: () => true });

  const remainingLabel =
    model.daysRemaining == null
      ? null
      : model.daysRemaining < 0
        ? t("dashboard.home.paymentNotice.overdueByDays", {
            count: Math.abs(model.daysRemaining),
          })
        : model.daysRemaining === 0
          ? t("dashboard.home.paymentNotice.dueToday")
          : model.daysRemaining === 1
            ? t("dashboard.home.paymentNotice.oneDayLeft")
            : t("dashboard.home.paymentNotice.daysLeft", { count: model.daysRemaining });

  const titleKey =
    model.phase === "locked"
      ? "dashboard.home.paymentNotice.lockedTitle"
      : model.phase === "unpaid"
        ? "dashboard.home.paymentNotice.unpaidTitle"
        : model.phase === "due_today"
          ? "dashboard.home.paymentNotice.dueTodayTitle"
          : "dashboard.home.paymentNotice.approachingTitle";

  const bodyKey =
    model.phase === "locked"
      ? "dashboard.home.paymentNotice.lockedBody"
      : model.phase === "unpaid"
        ? "dashboard.home.paymentNotice.unpaidBody"
        : dueLabel
          ? "dashboard.home.paymentNotice.approachingBodyWithDate"
          : "dashboard.home.paymentNotice.approachingBody";

  const Icon =
    model.phase === "locked"
      ? Lock
      : model.phase === "unpaid"
        ? ShieldAlert
        : model.urgency === "critical"
          ? AlertTriangle
          : Clock3;

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="subscription-payment-notice"
      data-phase={model.phase}
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm",
        styles.shell,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
              styles.icon,
            )}
          >
            <Icon className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">{t(titleKey)}</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                  styles.badge,
                )}
              >
                {t(`dashboard.home.paymentNotice.badge.${model.phase}`)}
              </span>
            </div>
            <p className="text-sm text-current/80">
              {dueLabel && model.phase !== "locked" && model.phase !== "unpaid"
                ? t(bodyKey, { date: dueLabel })
                : t(bodyKey)}
            </p>
            {remainingLabel && model.phase !== "locked" ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-current/70">
                <Clock3 className="size-3.5 shrink-0" aria-hidden />
                {remainingLabel}
              </p>
            ) : null}
            {model.phase === "unpaid" && !hasInlinePay ? (
              <p className="text-xs text-current/65">{t("dashboard.home.paymentNotice.unpaidHint")}</p>
            ) : null}
          </div>
        </div>

        {model.showPayCta && !hasInlinePay ? (
          <Button
            asChild
            size="sm"
            variant={model.phase === "unpaid" || model.phase === "due_today" ? "default" : "outline"}
            className={cn(
              "shrink-0",
              model.phase !== "unpaid" &&
                model.phase !== "due_today" &&
                "border-current/20 bg-background/70 hover:bg-background",
            )}
          >
          <Link href={payHref}>
            <CreditCard className="me-1.5 size-3.5" aria-hidden />
            {t("dashboard.home.paymentNotice.ctaPay")}
          </Link>
          </Button>
        ) : null}
      </div>

      {hasInlinePay ? (
        <div className="rounded-lg border border-current/10 bg-background/80 p-1 shadow-sm">
          {paymentPanel}
        </div>
      ) : null}
    </aside>
  );
}
