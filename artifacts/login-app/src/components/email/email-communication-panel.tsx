import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Send } from "lucide-react";
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
  COMMUNICATION_QUEUE_STATUSES,
  type CommunicationQueueStatus,
} from "@/lib/communication/types";
import { localizeCommunicationStatus } from "@/lib/communication/utilities/communication-localize";

type Props = {
  /** Optional status default for Sent-style views. */
  defaultStatus?: CommunicationQueueStatus | "";
  hintKey?: string;
};

/**
 * Email folder content reusing the existing communication history/queue surfaces,
 * scoped to the email channel (no duplicate email delivery system).
 */
export function EmailCommunicationPanel({ defaultStatus = "", hintKey }: Props) {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [statusFilter, setStatusFilter] = useState<CommunicationQueueStatus | "">(defaultStatus);

  const filter = useMemo(
    () => ({
      channel: "email" as const,
      status: statusFilter || undefined,
    }),
    [statusFilter],
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
      {hintKey ? (
        <DashboardCard className="p-4">
          <p className="text-sm text-muted-foreground">{t(hintKey)}</p>
        </DashboardCard>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
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
      </div>

      <CommunicationStatsGrid
        stats={stats ?? { sentToday: 0, delivered: 0, queued: 0, failed: 0, retrying: 0 }}
        loading={statsLoading}
      />

      <div className="flex flex-wrap gap-3">
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
