import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import type { CommunicationCenterStats } from "@/lib/communication/types";

type CommunicationStatsGridProps = {
  stats: CommunicationCenterStats;
  loading?: boolean;
};

export function CommunicationStatsGrid({ stats, loading }: CommunicationStatsGridProps) {
  const { t } = useTranslation("common");

  const items = [
    { key: "sentToday", value: stats.sentToday, label: t("communication.stats.sentToday") },
    { key: "delivered", value: stats.delivered, label: t("communication.stats.delivered") },
    { key: "queued", value: stats.queued, label: t("communication.stats.queued") },
    { key: "failed", value: stats.failed, label: t("communication.stats.failed") },
    { key: "retrying", value: stats.retrying, label: t("communication.stats.retrying") },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <DashboardCard key={item.key} className="p-4">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="mt-1 text-2xl font-semibold">
            {loading ? "—" : item.value}
          </div>
        </DashboardCard>
      ))}
    </div>
  );
}
