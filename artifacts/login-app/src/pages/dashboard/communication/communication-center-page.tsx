import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Info, MessageSquare, Radio, Send } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { DashboardCard, DashboardPageFallback } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { CommunicationStatsGrid } from "@/components/communication/communication-stats-grid";
import { CommunicationHistoryTable } from "@/components/communication/communication-history-table";
import {
  useCommunicationHistory,
  useCommunicationStats,
  useProcessCommunicationQueue,
  useRetryCommunicationMessage,
} from "@/lib/communication/hooks";
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_QUEUE_STATUSES,
  type CommunicationChannel,
  type CommunicationQueueStatus,
} from "@/lib/communication/types";
import {
  localizeCommunicationChannel,
  localizeCommunicationStatus,
} from "@/lib/communication/utilities/communication-localize";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("communication.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("communication.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
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

      <DashboardCard className="border-primary/20 bg-primary/5 p-4">
        <div className="flex gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <div>
              <p className="text-sm font-semibold">{t("communication.purpose.title")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("communication.purpose.body")}</p>
            </div>
            <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
              <li>{t("communication.purpose.pointQueue")}</li>
              <li>{t("communication.purpose.pointNotChat")}</li>
              <li>{t("communication.purpose.pointChannels")}</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild type="button" size="sm" variant="secondary">
                <Link href="/dashboard/omnichannel">
                  <MessageSquare className="me-1 size-3.5" />
                  {t("communication.purpose.openOmnichannel")}
                </Link>
              </Button>
              <Button asChild type="button" size="sm" variant="outline">
                <Link href="/dashboard/channels">
                  <Radio className="me-1 size-3.5" />
                  {t("communication.purpose.openChannels")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </DashboardCard>

      <CommunicationStatsGrid
        stats={stats ?? { sentToday: 0, delivered: 0, queued: 0, failed: 0, retrying: 0 }}
        loading={statsLoading}
      />

      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as CommunicationChannel | "")}
          aria-label={t("communication.filters.channel")}
        >
          <option value="">{t("communication.filters.allChannels")}</option>
          {COMMUNICATION_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {localizeCommunicationChannel(t, channel)}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CommunicationQueueStatus | "")}
          aria-label={t("communication.filters.status")}
        >
          <option value="">{t("communication.filters.allStatuses")}</option>
          {COMMUNICATION_QUEUE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {localizeCommunicationStatus(t, status)}
            </option>
          ))}
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
