import { Clock3, CreditCard, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { formatLocalizedDate } from "@/lib/billing/billing-display-i18n";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import {
  canOpenWorkspaceBilling,
  canViewCompanySubscription,
} from "@/lib/company-workspace/permissions";
import type { TrialBannerModel } from "@/lib/dashboard/resolve-trial-banner";
import { cn } from "@/lib/utils";

type Props = {
  model: TrialBannerModel;
  access: {
    isSuperAdmin: boolean;
    hasPermission: (code: string) => boolean;
  };
};

const urgencyStyles: Record<
  TrialBannerModel["urgency"],
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
    shell: "border-orange-500/35 bg-orange-500/10 text-orange-950 dark:text-orange-50",
    icon: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    badge: "bg-orange-500/15 text-orange-900 dark:text-orange-100",
  },
};

export function DashboardTrialBanner({ model, access }: Props) {
  const { t, i18n } = useTranslation("common");
  const styles = urgencyStyles[model.urgency];
  const endsLabel = model.endsAt ? formatLocalizedDate(model.endsAt, i18n.language) : null;

  const remainingLabel =
    model.daysRemaining == null
      ? null
      : model.daysRemaining < 0
        ? t("dashboard.home.trialBanner.expired")
        : model.daysRemaining === 0
          ? t("billing.statusContext.endsToday")
          : model.daysRemaining === 1
            ? t("billing.statusContext.endsTomorrow")
            : t("billing.statusContext.daysRemaining", { count: model.daysRemaining });

  const showBillingCta =
    canViewCompanySubscription(access) || canOpenWorkspaceBilling(access);

  return (
    <aside
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between",
        styles.shell,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
            styles.icon,
          )}
        >
          <Sparkles className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold tracking-tight">
              {t("dashboard.home.trialBanner.title")}
            </p>
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                styles.badge,
              )}
            >
              {t("dashboard.home.trialBanner.badge")}
            </span>
          </div>
          <p className="text-sm text-current/80">
            {endsLabel
              ? t("dashboard.home.trialBanner.bodyWithDate", { date: endsLabel })
              : t("dashboard.home.trialBanner.body")}
          </p>
          {remainingLabel ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-current/70">
              <Clock3 className="size-3.5 shrink-0" aria-hidden />
              {remainingLabel}
            </p>
          ) : null}
        </div>
      </div>

      {showBillingCta ? (
        <Button
          asChild
          size="sm"
          variant="outline"
          className="shrink-0 border-current/20 bg-background/70 hover:bg-background"
        >
          <Link href={companyWorkspaceHref("subscription")}>
            <CreditCard className="me-1.5 size-3.5" aria-hidden />
            {t("dashboard.home.trialBanner.cta")}
          </Link>
        </Button>
      ) : null}
    </aside>
  );
}
