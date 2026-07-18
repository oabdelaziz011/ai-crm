import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { DashboardCard } from "@/components/dashboard/ui";
import { formatBillingDate } from "@/lib/billing/format";
import type { CompanySubscription, SubscriptionEvent } from "@/lib/billing/types";
import { History } from "lucide-react";

const TIMELINE_EVENT_TYPES = new Set([
  "subscription_created",
  "invoice_generated",
  "payment_received",
  "subscription_activated",
  "renewed",
  "plan_changed",
  "grace_period_started",
  "expired",
  "suspended",
  "restored",
  "canceled",
  "receipt_generated",
  "company_created",
]);

type SubscriptionTimelinePanelProps = {
  events: SubscriptionEvent[];
  loading?: boolean;
  subscription?: CompanySubscription | null;
  companyCreatedAt?: string | null;
};

function buildOnboardingTimeline(
  subscription: CompanySubscription,
  companyCreatedAt: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): SubscriptionEvent[] {
  const synthetic: SubscriptionEvent[] = [];
  const companyDate = companyCreatedAt ?? subscription.created_at;

  synthetic.push({
    id: "onboarding-company-created",
    company_id: subscription.company_id,
    subscription_id: subscription.id,
    event_type: "company_created",
    title: t("billing.detail.emptyStates.timelineCompanyCreated"),
    description: subscription.company?.name ?? null,
    metadata: { synthetic: true, onboarding: true },
    occurred_at: companyDate,
  });

  synthetic.push({
    id: "onboarding-subscription-created",
    company_id: subscription.company_id,
    subscription_id: subscription.id,
    event_type: "subscription_created",
    title: t("billing.detail.emptyStates.timelineSubscriptionCreated"),
    description: subscription.plan?.display_name ?? subscription.plan?.name ?? null,
    metadata: { synthetic: true, onboarding: true },
    occurred_at: subscription.created_at,
  });

  return synthetic.sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
}

export function SubscriptionTimelinePanel({
  events,
  loading,
  subscription,
  companyCreatedAt,
}: SubscriptionTimelinePanelProps) {
  const { t } = useTranslation("common");

  const timelineEvents = useMemo(() => {
    const live = events.filter((event) => TIMELINE_EVENT_TYPES.has(event.event_type));
    if (live.length > 0) return live;
    if (!subscription) return [];
    return buildOnboardingTimeline(subscription, companyCreatedAt, t);
  }, [events, subscription, companyCreatedAt, t]);

  const isOnboardingOnly = timelineEvents.every((event) => event.metadata?.synthetic === true);

  return (
    <DashboardCard className="p-5">
      <h2 className="font-semibold mb-4">{t("billing.detail.timeline")}</h2>
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-white/10" />
          ))}
        </div>
      ) : timelineEvents.length === 0 ? (
        <BillingEmptyState title={t("billing.detail.noEvents")} icon={History} />
      ) : (
        <div className="space-y-4">
          {isOnboardingOnly ? (
            <p className="text-sm text-muted-foreground mb-2">{t("billing.detail.emptyStates.timelineOnboardingHint")}</p>
          ) : null}
          {timelineEvents.map((event) => (
            <div key={event.id} className="relative border-s-2 border-primary/30 ps-4">
              <p className="text-sm font-medium">{event.title}</p>
              {event.description ? (
                <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground mt-1">{formatBillingDate(event.occurred_at, true)}</p>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
