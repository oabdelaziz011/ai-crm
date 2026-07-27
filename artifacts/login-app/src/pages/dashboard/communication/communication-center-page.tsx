import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { DashboardPageFallback } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { CommunicationStatsGrid } from "@/components/communication/communication-stats-grid";
import { CommunicationHistoryTable } from "@/components/communication/communication-history-table";
import {
  useCommunicationHistory,
  useCommunicationStats,
  useProcessCommunicationQueue,
  useRetryCommunicationMessage,
} from "@/lib/communication/hooks";
import type { CommunicationChannel, CommunicationQueueStatus } from "@/lib/communication/types";

export function CommunicationCenterPage() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const [channelFilter, setChannelFilter] = useState<CommunicationChannel | "">("");
  const [statusFilter, setStatusFilter] = useState<CommunicationQueueStatus | "">("");

  const filter = useMemo(
    () => ({
      channel: channelFilter || undefined,
      status: statusFilter || undefined,
    }),
    [channelFilter, statusFilter],
  );

  const { data: stats, isLoading: statsLoading } = useCommunicationStats(companyId);
  const { data: history = [], isLoading: historyLoading } = useCommunicationHistory(companyId, filter);
  const retry = useRetryCommunicationMessage(companyId);
  const processQueue = useProcessCommunicationQueue(companyId);

  if (!companyId && !statsLoading) {
    return <DashboardPageFallback />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("communication.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("communication.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={processQueue.isPending}
            onClick={() => {
              void processQueue.mutateAsync("email").then((r) => {
                toast.success(t("communication.processed", { count: r.processed }));
              });
            }}
          >
            <Send className="me-1 h-4 w-4" />
            {t("communication.processEmail")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={processQueue.isPending}
            onClick={() => {
              void processQueue.mutateAsync("whatsapp").then((r) => {
                toast.success(t("communication.processed", { count: r.processed }));
              });
            }}
          >
            <Send className="me-1 h-4 w-4" />
            {t("communication.processWhatsapp")}
          </Button>
        </div>
      </div>

      <CommunicationStatsGrid
        stats={stats ?? { sentToday: 0, delivered: 0, queued: 0, failed: 0, retrying: 0 }}
        loading={statsLoading}
      />

      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as CommunicationChannel | "")}
          aria-label={t("communication.filters.channel")}
        >
          <option value="">{t("communication.filters.allChannels")}</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="push">Push</option>
        </select>
        <select
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CommunicationQueueStatus | "")}
          aria-label={t("communication.filters.status")}
        >
          <option value="">{t("communication.filters.allStatuses")}</option>
          <option value="queued">{t("communication.stats.queued")}</option>
          <option value="failed">{t("communication.stats.failed")}</option>
          <option value="retrying">{t("communication.stats.retrying")}</option>
          <option value="delivered">{t("communication.stats.delivered")}</option>
        </select>
      </div>

      <CommunicationHistoryTable
        entries={history}
        loading={historyLoading}
        retryPending={retry.isPending}
        onRetry={(id) => {
          retry.mutate(id, {
            onSuccess: () => toast.success(t("communication.retrySuccess")),
            onError: () => toast.error(t("communication.retryFailed")),
          });
        }}
      />
    </div>
  );
}
