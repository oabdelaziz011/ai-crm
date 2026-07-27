import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import type { CommunicationHistoryEntry } from "@/lib/communication/types";

type CommunicationHistoryTableProps = {
  entries: CommunicationHistoryEntry[];
  loading?: boolean;
  onRetry?: (id: string) => void;
  retryPending?: boolean;
};

export function CommunicationHistoryTable({
  entries,
  loading,
  onRetry,
  retryPending,
}: CommunicationHistoryTableProps) {
  const { t } = useTranslation("common");

  return (
    <DashboardCard className="overflow-hidden p-0">
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="font-semibold">{t("communication.history.title")}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={t("communication.history.title")}>
          <thead>
            <tr className="border-b border-white/10 text-start text-xs text-muted-foreground">
              <th className="px-5 py-3">{t("communication.history.channel")}</th>
              <th className="px-5 py-3">{t("communication.history.recipient")}</th>
              <th className="px-5 py-3">{t("communication.history.template")}</th>
              <th className="px-5 py-3">{t("communication.history.status")}</th>
              <th className="px-5 py-3">{t("communication.history.retries")}</th>
              <th className="px-5 py-3">{t("communication.history.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  {t("common.loading")}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  {t("communication.history.empty")}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-white/5">
                  <td className="px-5 py-3 capitalize">{entry.channel}</td>
                  <td className="px-5 py-3">{entry.recipient}</td>
                  <td className="px-5 py-3">{entry.templateKey}</td>
                  <td className="px-5 py-3 capitalize">{entry.status}</td>
                  <td className="px-5 py-3">{entry.retryCount}</td>
                  <td className="px-5 py-3">
                    {(entry.status === "failed" || entry.status === "retrying") && onRetry ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={retryPending}
                        onClick={() => onRetry(entry.id)}
                        aria-label={t("communication.history.retry")}
                      >
                        <RefreshCw className="me-1 h-3.5 w-3.5" />
                        {t("communication.history.retry")}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}
