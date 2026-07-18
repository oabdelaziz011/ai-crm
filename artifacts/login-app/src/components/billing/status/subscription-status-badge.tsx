import { useTranslation } from "react-i18next";
import { getSubscriptionStatusDisplay } from "@/lib/billing/subscription-status-display";
import type { BillingSubscriptionStatus } from "@/lib/billing/types";

type SubscriptionStatusBadgeProps = {
  status: BillingSubscriptionStatus;
  currentPeriodEnd?: string | null;
  nextRenewalAt?: string | null;
  trialEndsAt?: string | null;
  gracePeriodEndsAt?: string | null;
};

export function SubscriptionStatusBadge(props: SubscriptionStatusBadgeProps) {
  const { t } = useTranslation("common");
  const display = getSubscriptionStatusDisplay(props, t);
  const tone =
    props.status === "active"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : props.status === "trialing"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
        : props.status === "grace_period"
          ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
          : props.status === "past_due" || props.status === "expired"
            ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
            : "border-slate-500/30 bg-slate-500/10 text-slate-300";

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex w-fit text-xs font-mono px-2.5 py-1 rounded-full border ${tone}`}>
        {display.label}
      </span>
      {display.contextLine ? (
        <span className="text-xs text-muted-foreground">{display.contextLine}</span>
      ) : null}
    </div>
  );
}
