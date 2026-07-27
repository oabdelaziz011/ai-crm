import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/ui";
import type { WaitingQueueEntry } from "@/lib/scheduling/operations/queue";
import {
  buildWaitingQueue,
  formatWaitingDuration,
} from "@/lib/scheduling/operations/queue";
import type { OperationsBookingView } from "@/lib/scheduling/operations/types";
import { useLiveTimer } from "@/lib/scheduling/operations/hooks";

type OperationsWaitingQueuePanelProps = {
  entries: WaitingQueueEntry[];
  bookings: OperationsBookingView[];
  onSelectBooking: (bookingId: string) => void;
  loading?: boolean;
};

export function OperationsWaitingQueuePanel({
  entries: initialEntries,
  bookings,
  onSelectBooking,
  loading,
}: OperationsWaitingQueuePanelProps) {
  const { t } = useTranslation("common");
  const tick = useLiveTimer();

  const entries = useMemo(
    () => (bookings.length > 0 ? buildWaitingQueue(bookings, new Date(tick)) : initialEntries),
    [bookings, initialEntries, tick],
  );

  return (
    <DashboardCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{t("scheduling.operations.queue.title")}</h3>
        <span className="text-xs text-muted-foreground">{entries.length}</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("scheduling.operations.queue.empty")}</p>
      ) : (
        <ul className="space-y-2" role="list" aria-label={t("scheduling.operations.queue.title")}>
          {entries.map((entry) => (
            <li key={entry.bookingId}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-start transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onSelectBooking(entry.bookingId)}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                  <Clock className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{entry.customerName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {entry.serviceName} · {entry.resourceName}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="font-mono text-sm font-semibold text-amber-300">
                    {formatWaitingDuration(entry.waitingMinutes)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {t("scheduling.operations.queue.priority")} {entry.priority}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
