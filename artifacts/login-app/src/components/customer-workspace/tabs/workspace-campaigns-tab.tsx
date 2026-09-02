import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Megaphone,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspaceSkeleton } from "@/components/customer-workspace/workspace-ui";
import {
  WorkspaceInlineEmpty,
  WorkspaceStatusChip,
  WorkspaceTabFrame,
} from "@/components/customer-workspace/workspace-tab-frame";
import { useCustomerCampaignHistory } from "@/hooks/campaigns/use-customer-campaign-history";
import {
  buildCustomerCampaignTimeline,
  resolveCustomerCampaignDisplayStatus,
  type CustomerCampaignHistoryItem,
  type CustomerCampaignHistoryPeriod,
  type CustomerCampaignHistoryStatusFilter,
} from "@/lib/campaigns/customer-campaign-history";
import {
  channelLabelKey,
  recipientStatusLabelKey,
} from "@/lib/campaigns/campaign-ui-presentation";
import type { MarketingCampaignChannel } from "@/lib/campaigns/types";
import { cn } from "@/lib/utils";

type Props = {
  customerId: string;
  companyId: string | null;
};

function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((part / total) * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function formatTs(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale.startsWith("ar") ? "ar" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function statusTone(
  status: ReturnType<typeof resolveCustomerCampaignDisplayStatus>,
): "muted" | "success" | "warning" | "danger" | "primary" {
  if (status === "failed") return "danger";
  if (
    status === "read" ||
    status === "delivered" ||
    status === "sent" ||
    status === "replied"
  )
    return "success";
  if (status === "queued" || status === "pending") return "warning";
  if (status === "skipped") return "muted";
  return "primary";
}

export function WorkspaceCampaignsTab({ customerId, companyId }: Props) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language ?? "en";
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<CustomerCampaignHistoryPeriod>("all");
  const [status, setStatus] = useState<CustomerCampaignHistoryStatusFilter>("all");
  const [channel, setChannel] = useState<MarketingCampaignChannel | "all">("all");
  const [selected, setSelected] = useState<CustomerCampaignHistoryItem | null>(null);

  const history = useCustomerCampaignHistory({
    companyId,
    customerId,
    page,
    period,
    status,
    channel,
  });

  const summary = history.summary;
  const totalPages = Math.max(1, Math.ceil(history.total / history.pageSize));

  const timeline = useMemo(
    () => (selected ? buildCustomerCampaignTimeline(selected) : []),
    [selected],
  );

  if (!history.canView) {
    return (
      <WorkspaceTabFrame title={t("dashboard.customerWorkspace.tabs.campaigns")}>
        <WorkspaceInlineEmpty
          icon={Megaphone}
          title={t("dashboard.customerWorkspace.campaigns.noPermissionTitle")}
          description={t("dashboard.customerWorkspace.campaigns.noPermissionBody")}
        />
      </WorkspaceTabFrame>
    );
  }

  if (!companyId) {
    return (
      <WorkspaceTabFrame title={t("dashboard.customerWorkspace.tabs.campaigns")}>
        <WorkspaceInlineEmpty
          icon={Megaphone}
          title={t("dashboard.customerWorkspace.campaigns.emptyTitle")}
          description={t("dashboard.customerWorkspace.campaigns.emptyDescription")}
        />
      </WorkspaceTabFrame>
    );
  }

  if (history.isLoading && !history.data) {
    return <WorkspaceSkeleton rows={6} />;
  }

  return (
    <>
      <WorkspaceTabFrame
        title={t("dashboard.customerWorkspace.campaigns.title")}
        subtitle={t("dashboard.customerWorkspace.campaigns.subtitle")}
      >
        {summary ? (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["total", summary.total, null],
                ["sent", summary.sent, pct(summary.sent, summary.total)],
                ["delivered", summary.delivered, pct(summary.delivered, summary.total)],
                ["read", summary.read, pct(summary.read, summary.total)],
                ["replied", summary.replied, pct(summary.replied, summary.total)],
                ["failed", summary.failed, pct(summary.failed, summary.total)],
              ] as const
            ).map(([key, value, rate]) => (
              <div
                key={key}
                className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
              >
                <div className="text-[11px] font-medium text-muted-foreground">
                  {t(`dashboard.customerWorkspace.campaigns.summary.${key}`)}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                  {value}
                </div>
                {rate ? (
                  <div className="text-[11px] text-muted-foreground tabular-nums">{rate}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select
            value={period}
            onValueChange={(v) => {
              setPage(1);
              setPeriod(v as CustomerCampaignHistoryPeriod);
            }}
          >
            <SelectTrigger className="h-8 w-[9.5rem] rounded-lg text-xs">
              <SelectValue placeholder={t("dashboard.customerWorkspace.campaigns.filters.period")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t("dashboard.customerWorkspace.campaigns.period.7d")}</SelectItem>
              <SelectItem value="30d">{t("dashboard.customerWorkspace.campaigns.period.30d")}</SelectItem>
              <SelectItem value="90d">{t("dashboard.customerWorkspace.campaigns.period.90d")}</SelectItem>
              <SelectItem value="all">{t("dashboard.customerWorkspace.campaigns.period.all")}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={status}
            onValueChange={(v) => {
              setPage(1);
              setStatus(v as CustomerCampaignHistoryStatusFilter);
            }}
          >
            <SelectTrigger className="h-8 w-[10rem] rounded-lg text-xs">
              <SelectValue placeholder={t("dashboard.customerWorkspace.campaigns.filters.status")} />
            </SelectTrigger>
            <SelectContent>
              {(
                ["all", "sent", "delivered", "read", "replied", "failed", "pending", "skipped"] as const
              ).map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`dashboard.customerWorkspace.campaigns.statusFilter.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={channel}
            onValueChange={(v) => {
              setPage(1);
              setChannel(v as MarketingCampaignChannel | "all");
            }}
          >
            <SelectTrigger className="h-8 w-[9rem] rounded-lg text-xs">
              <SelectValue placeholder={t("dashboard.customerWorkspace.campaigns.filters.channel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dashboard.customerWorkspace.campaigns.channelFilter.all")}</SelectItem>
              <SelectItem value="whatsapp">{t(channelLabelKey("whatsapp"))}</SelectItem>
              <SelectItem value="instagram">{t(channelLabelKey("instagram"))}</SelectItem>
              <SelectItem value="messenger">{t(channelLabelKey("messenger"))}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {history.error ? (
          <p className="mb-3 text-sm text-destructive">{history.error}</p>
        ) : null}

        {history.items.length === 0 ? (
          <WorkspaceInlineEmpty
            icon={Megaphone}
            title={t("dashboard.customerWorkspace.campaigns.emptyTitle")}
            description={t("dashboard.customerWorkspace.campaigns.emptyDescription")}
          />
        ) : (
          <>
            <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="w-[22%] px-3 py-2.5 text-start">
                    {t("dashboard.customerWorkspace.campaigns.columns.campaign")}
                  </th>
                  <th className="px-3 py-2.5 text-start">
                    {t("dashboard.customerWorkspace.campaigns.columns.message")}
                  </th>
                  <th className="w-[12%] px-3 py-2.5 text-start">
                    {t("dashboard.customerWorkspace.campaigns.columns.channel")}
                  </th>
                  <th className="w-[14%] px-3 py-2.5 text-start">
                    {t("dashboard.customerWorkspace.campaigns.columns.sentAt")}
                  </th>
                  <th className="w-[12%] px-3 py-2.5 text-start">
                    {t("dashboard.customerWorkspace.campaigns.columns.status")}
                  </th>
                  <th className="w-[10%] px-3 py-2.5 text-start">
                    {t("dashboard.customerWorkspace.campaigns.columns.delivered")}
                  </th>
                  <th className="w-[10%] px-3 py-2.5 text-start">
                    {t("dashboard.customerWorkspace.campaigns.columns.read")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((row) => {
                  const display = resolveCustomerCampaignDisplayStatus(row);
                  return (
                    <tr
                      key={row.recipientId}
                      className="cursor-pointer border-b border-border/40 hover:bg-primary/5"
                      onClick={() => setSelected(row)}
                    >
                      <td className="px-3 py-2.5 text-start">
                        <div className="line-clamp-1 font-medium">{row.campaignName}</div>
                        <div dir="ltr" className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {row.campaignId.slice(0, 8)}…
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-start">
                        <div className="line-clamp-2 text-muted-foreground">
                          {row.contentDetail || row.contentTitle || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-start">
                        {t(channelLabelKey(row.channel))}
                      </td>
                      <td className="px-3 py-2.5 text-start tabular-nums text-muted-foreground">
                        {formatTs(row.delivery?.sentAt ?? row.createdAt, locale)}
                      </td>
                      <td className="px-3 py-2.5 text-start">
                        <WorkspaceStatusChip tone={statusTone(display)}>
                          {display === "delivered" ||
                          display === "read" ||
                          display === "replied"
                            ? t(`dashboard.customerWorkspace.campaigns.displayStatus.${display}`)
                            : t(recipientStatusLabelKey(row.status))}
                        </WorkspaceStatusChip>
                      </td>
                      <td className="px-3 py-2.5 text-start tabular-nums text-muted-foreground">
                        {formatTs(row.delivery?.deliveredAt, locale)}
                      </td>
                      <td className="px-3 py-2.5 text-start tabular-nums text-muted-foreground">
                        {formatTs(row.delivery?.readAt, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {history.total > history.pageSize ? (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {t("dashboard.customerWorkspace.campaigns.pagination", {
                    page,
                    pages: totalPages,
                    total: history.total,
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-3.5 rtl:rotate-180" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="size-3.5 rtl:rotate-180" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </WorkspaceTabFrame>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.campaignName}</SheetTitle>
                <SheetDescription>
                  {t("dashboard.customerWorkspace.campaigns.detail.subtitle")}
                </SheetDescription>
              </SheetHeader>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow
                  label={t("dashboard.customerWorkspace.campaigns.detail.campaignId")}
                  value={
                    <span dir="ltr" className="font-mono text-xs">
                      {selected.campaignId}
                    </span>
                  }
                />
                <DetailRow
                  label={t("dashboard.customerWorkspace.campaigns.columns.message")}
                  value={selected.contentDetail || selected.contentTitle || "—"}
                />
                <DetailRow
                  label={t("dashboard.customerWorkspace.campaigns.columns.channel")}
                  value={t(channelLabelKey(selected.channel))}
                />
                <DetailRow
                  label={t("dashboard.customerWorkspace.campaigns.columns.status")}
                  value={t(recipientStatusLabelKey(selected.status))}
                />
                <DetailRow
                  label={t("dashboard.customerWorkspace.campaigns.detail.sentAt")}
                  value={formatTs(selected.delivery?.sentAt ?? selected.createdAt, locale)}
                />
                <DetailRow
                  label={t("dashboard.customerWorkspace.campaigns.columns.delivered")}
                  value={formatTs(selected.delivery?.deliveredAt, locale)}
                />
                <DetailRow
                  label={t("dashboard.customerWorkspace.campaigns.columns.read")}
                  value={formatTs(selected.delivery?.readAt, locale)}
                />
                <DetailRow
                  label={t("dashboard.customerWorkspace.campaigns.detail.reply")}
                  value="—"
                />
                {selected.errorMessage ? (
                  <DetailRow
                    label={t("dashboard.customerWorkspace.campaigns.detail.failure")}
                    value={selected.errorMessage}
                  />
                ) : null}
                {(selected.providerMessageId || selected.delivery?.externalMessageId) && (
                  <DetailRow
                    label={t("dashboard.customerWorkspace.campaigns.detail.providerId")}
                    value={
                      <span dir="ltr" className="break-all font-mono text-xs">
                        {selected.providerMessageId || selected.delivery?.externalMessageId}
                      </span>
                    }
                  />
                )}
              </dl>

              <div className="mt-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("dashboard.customerWorkspace.campaigns.detail.timeline")}
                </h3>
                <ol className="space-y-2 border-s border-border/60 ps-3">
                  {timeline.map((ev) => (
                    <li key={`${ev.key}-${ev.at}`} className="relative text-sm">
                      <span
                        className={cn(
                          "absolute -start-[0.91rem] top-1.5 size-2 rounded-full bg-primary",
                        )}
                      />
                      <div className="font-medium">
                        {t(`dashboard.customerWorkspace.campaigns.timeline.${ev.key}`)}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatTs(ev.at, locale)}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
