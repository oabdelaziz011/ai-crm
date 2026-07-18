import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { BillingPagination } from "@/components/billing/ui/billing-pagination";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { useNotifications } from "@/hooks/use-notifications";
import { localizeNotification } from "@/lib/notification-i18n";
import { formatBillingDate } from "@/lib/billing/format";

type SubscriptionNotificationsPanelProps = {
  companyId: string;
  enabled?: boolean;
  companyName?: string | null;
};

export function SubscriptionNotificationsPanel({
  companyId,
  enabled = true,
  companyName,
}: SubscriptionNotificationsPanelProps) {
  const { t } = useTranslation("common");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useNotifications(enabled ? companyId : null, page);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 8;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const categoryLabel = (category: string | null | undefined) => {
    if (!category) return t("notifications.category.system");
    const key = `notifications.category.${category}`;
    return t(key, category);
  };

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-white/5 p-5">
        <h2 className="font-semibold">{t("billing.detail.notifications")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.detail.notificationsHint")}</p>
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      {isLoading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-white/10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="divide-y divide-white/5">
          <BillingEmptyState
            title={t("billing.detail.emptyStates.notificationsWelcome")}
            description={t("billing.detail.emptyStates.notificationsWelcomeHint", {
              company: companyName ?? t("billing.provisioning.defaultCompany"),
            })}
            icon={Bell}
          />
          <div className="space-y-3 p-5">
            {(["notificationsWelcomeCreated", "notificationsWelcomeBilling"] as const).map((key) => (
              <div key={key} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-1">
                <p className="text-sm font-medium">{t(`billing.detail.emptyStates.${key}`)}</p>
                <p className="text-xs text-muted-foreground">{t(`billing.detail.emptyStates.${key}Hint`)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {items.map((item) => {
            const localized = localizeNotification(t, item);
            return (
              <div key={item.id} className="space-y-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{localized.title}</p>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {categoryLabel(item.category)}
                  </span>
                </div>
                {localized.message ? (
                  <p className="text-xs text-muted-foreground">{localized.message}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">{formatBillingDate(item.created_at, true)}</p>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 ? (
        <BillingPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageInfoLabel={t("billing.pagination.pageInfo", { page, totalPages, total })}
          previousLabel={t("billing.pagination.previous")}
          nextLabel={t("billing.pagination.next")}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      ) : null}
    </DashboardCard>
  );
}
