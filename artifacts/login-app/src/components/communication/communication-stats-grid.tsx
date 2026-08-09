import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Send,
} from "lucide-react";
import { DashboardStatCard } from "@/components/dashboard/ui";
import type { CommunicationCenterStats } from "@/lib/communication/types";

type CommunicationStatsGridProps = {
  stats: CommunicationCenterStats;
  loading?: boolean;
};

export function CommunicationStatsGrid({ stats, loading }: CommunicationStatsGridProps) {
  const { t } = useTranslation("common");

  const items = [
    {
      key: "sentToday",
      value: stats.sentToday,
      label: t("communication.stats.sentToday"),
      icon: Send,
    },
    {
      key: "delivered",
      value: stats.delivered,
      label: t("communication.stats.delivered"),
      icon: CheckCircle2,
    },
    {
      key: "queued",
      value: stats.queued,
      label: t("communication.stats.queued"),
      icon: Clock3,
    },
    {
      key: "failed",
      value: stats.failed,
      label: t("communication.stats.failed"),
      icon: AlertTriangle,
    },
    {
      key: "retrying",
      value: stats.retrying,
      label: t("communication.stats.retrying"),
      icon: RefreshCw,
    },
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <DashboardStatCard
          key={item.key}
          label={item.label}
          value={item.value}
          icon={item.icon}
          loading={loading}
        />
      ))}
    </div>
  );
}
