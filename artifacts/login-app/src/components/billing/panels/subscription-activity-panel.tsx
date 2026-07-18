import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { DashboardCard } from "@/components/dashboard/ui";
import { formatBillingDate } from "@/lib/billing/format";
import type { SubscriptionEvent } from "@/lib/billing/types";

type SubscriptionActivityPanelProps = {
  events: SubscriptionEvent[];
  loading?: boolean;
};

export function SubscriptionActivityPanel({ events, loading }: SubscriptionActivityPanelProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="p-5">
      <h2 className="font-semibold mb-4">{t("billing.detail.activity")}</h2>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/10" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <BillingEmptyState title={t("billing.detail.noEvents")} icon={Activity} />
      ) : (
        <div className="space-y-3 max-h-[520px] overflow-y-auto pe-1">
          {events.map((event) => (
            <div key={event.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{event.title}</p>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{event.event_type}</span>
              </div>
              {event.description ? (
                <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground mt-2">{formatBillingDate(event.occurred_at, true)}</p>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
