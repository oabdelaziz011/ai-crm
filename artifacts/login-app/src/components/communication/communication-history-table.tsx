import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard/ui";
import type { CommunicationHistoryEntry } from "@/lib/communication/types";
import {
  localizeCommunicationChannel,
  localizeCommunicationRecipient,
  localizeCommunicationStatus,
  localizeCommunicationTemplate,
  resolveDisplayTemplateKey,
} from "@/lib/communication/utilities/communication-localize";

type CommunicationHistoryTableProps = {
  entries: CommunicationHistoryEntry[];
  loading?: boolean;
  onRetry?: (id: string) => void;
  retryPending?: boolean;
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "delivered":
    case "sent":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "queued":
    case "processing":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
    case "failed":
    case "cancelled":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "retrying":
      return "border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-200";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function CommunicationHistoryTable({
  entries,
  loading,
  onRetry,
  retryPending,
}: CommunicationHistoryTableProps) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";

  return (
    <DashboardCard className="overflow-hidden p-0">
      <div className="border-b border-border/60 px-5 py-4">
        <h3 className="font-semibold">{t("communication.history.title")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("communication.history.subtitle")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={t("communication.history.title")}>
          <thead>
            <tr className="border-b border-border/60 text-start text-xs text-muted-foreground">
              <th className="px-5 py-3 font-medium">{t("communication.history.channel")}</th>
              <th className="px-5 py-3 font-medium">{t("communication.history.recipient")}</th>
              <th className="px-5 py-3 font-medium">{t("communication.history.template")}</th>
              <th className="px-5 py-3 font-medium">{t("communication.history.status")}</th>
              <th className="px-5 py-3 font-medium">{t("communication.history.createdAt")}</th>
              <th className="px-5 py-3 font-medium">{t("communication.history.retries")}</th>
              <th className="px-5 py-3 font-medium">{t("communication.history.failureReason")}</th>
              <th className="px-5 py-3 font-medium">{t("communication.history.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                  {t("common.loading")}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                  <div className="mx-auto max-w-md space-y-1">
                    <p className="font-medium text-foreground">{t("communication.history.emptyTitle")}</p>
                    <p className="text-xs">{t("communication.history.empty")}</p>
                  </div>
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const templateKey = resolveDisplayTemplateKey(entry.templateKey, entry.recipient);
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border/40 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-5 py-3 whitespace-nowrap">
                      {localizeCommunicationChannel(t, entry.channel)}
                    </td>
                    <td className="px-5 py-3">
                      {localizeCommunicationRecipient(t, entry.recipient, entry.templateKey)}
                    </td>
                    <td className="px-5 py-3">
                      {localizeCommunicationTemplate(t, templateKey)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant="outline"
                        className={`font-normal ${statusBadgeClass(entry.status)}`}
                      >
                        {localizeCommunicationStatus(t, entry.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.createdAt, locale)}
                    </td>
                    <td className="px-5 py-3 tabular-nums">
                      {entry.retryCount > 0 ? entry.retryCount : "—"}
                    </td>
                    <td className="max-w-[14rem] truncate px-5 py-3 text-muted-foreground" title={entry.failureReason ?? undefined}>
                      {entry.failureReason && entry.failureReason !== "cancelled"
                        ? entry.failureReason
                        : "—"}
                    </td>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}
