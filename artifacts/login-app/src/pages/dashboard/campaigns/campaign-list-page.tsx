import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { campaignCreateHref, campaignDetailHref } from "@/config/campaigns-route-registry";
import { useCampaignsList } from "@/hooks/campaigns/use-campaigns";
import { usePermissions } from "@/hooks/use-rbac";
import type { MarketingCampaignChannel, MarketingCampaignStatus } from "@/lib/campaigns";
import {
  CAMPAIGN_UI_CHANNELS,
  campaignStatusLabelKey,
  channelLabelKey,
  overallCampaignResultKind,
} from "@/lib/campaigns/campaign-ui-presentation";

export function CampaignListPage() {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { hasPermission, isSuperAdmin } = usePermissions();
  const canCreate = isSuperAdmin || hasPermission("campaigns.create");
  const [statusFilter, setStatusFilter] = useState<MarketingCampaignStatus | "all">("all");
  const [channelFilter, setChannelFilter] = useState<MarketingCampaignChannel | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data = [], isLoading, error } = useCampaignsList(
    true,
    statusFilter === "all" ? null : statusFilter,
  );

  const rows = useMemo(() => {
    return data.filter((row) => {
      if (channelFilter !== "all" && !row.channels.includes(channelFilter)) return false;
      const created = new Date(row.created_at).getTime();
      if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00`).getTime();
        if (Number.isFinite(from) && created < from) return false;
      }
      if (dateTo) {
        const to = new Date(`${dateTo}T23:59:59.999`).getTime();
        if (Number.isFinite(to) && created > to) return false;
      }
      return true;
    });
  }, [data, channelFilter, dateFrom, dateTo]);

  if (isLoading) {
    return (
      <DashboardCard className="p-6">
        <DashboardTableSkeleton rows={6} />
      </DashboardCard>
    );
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("campaigns.list.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("campaigns.list.subtitle")}</p>
        </div>
        {canCreate ? (
          <Button onClick={() => setLocation(campaignCreateHref())}>
            <Plus className="size-4 me-2" />
            {t("campaigns.list.create")}
          </Button>
        ) : null}
      </div>

      <DashboardCard className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as MarketingCampaignStatus | "all")}
          >
            <SelectTrigger className="w-[180px]" data-testid="campaigns-filter-status">
              <SelectValue placeholder={t("campaigns.list.filters.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("campaigns.list.filters.allStatuses")}</SelectItem>
              <SelectItem value="draft">{t("campaigns.status.draft")}</SelectItem>
              <SelectItem value="running">{t("campaigns.status.running")}</SelectItem>
              <SelectItem value="completed">{t("campaigns.status.completed")}</SelectItem>
              <SelectItem value="failed">{t("campaigns.status.failed")}</SelectItem>
              <SelectItem value="cancelled">{t("campaigns.status.cancelled")}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={channelFilter}
            onValueChange={(value) => setChannelFilter(value as MarketingCampaignChannel | "all")}
          >
            <SelectTrigger className="w-[180px]" data-testid="campaigns-filter-channel">
              <SelectValue placeholder={t("campaigns.list.filters.channel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("campaigns.list.filters.allChannels")}</SelectItem>
              {CAMPAIGN_UI_CHANNELS.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {t(channelLabelKey(channel))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("campaigns.list.dateFrom")}</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[160px]"
              data-testid="campaigns-filter-date-from"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("campaigns.list.dateTo")}</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[160px]"
              data-testid="campaigns-filter-date-to"
            />
          </div>
        </div>

        {/* Explicitly no SMS filter option */}
        <div className="hidden" data-testid="campaigns-sms-absent" aria-hidden>
          sms-not-available
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center space-y-2">
            <p className="font-medium">{t("campaigns.list.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("campaigns.list.empty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-muted-foreground">
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.name")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.created")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.createdBy")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.audience")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.channels")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.status")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.total")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.queued")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.sent")}</th>
                  <th className="py-2 pe-3 font-medium">{t("campaigns.list.columns.failed")}</th>
                  <th className="py-2 font-medium">{t("campaigns.list.columns.skipped")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const kind = overallCampaignResultKind({
                    status: row.status,
                    queued: row.queued_count,
                    sent: row.sent_count,
                    failed: row.failed_count,
                    skipped: row.skipped_count,
                  });
                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-3 pe-3">
                        <Link
                          href={campaignDetailHref(row.id)}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-3 pe-3 text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 pe-3 font-mono text-xs text-muted-foreground">
                        {row.created_by ?? "—"}
                      </td>
                      <td className="py-3 pe-3">{t(`campaigns.audienceType.${row.audience_type}`)}</td>
                      <td className="py-3 pe-3">
                        <div className="flex flex-wrap gap-1">
                          {row.channels.map((channel) => (
                            <Badge key={channel} variant="secondary">
                              {t(channelLabelKey(channel))}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pe-3">
                        <Badge variant={kind === "failed" ? "destructive" : "outline"}>
                          {kind === "partial"
                            ? t("campaigns.status.partial")
                            : t(campaignStatusLabelKey(row.status))}
                        </Badge>
                      </td>
                      <td className="py-3 pe-3 tabular-nums">{row.total_recipients_count}</td>
                      <td className="py-3 pe-3 tabular-nums">{row.queued_count}</td>
                      <td className="py-3 pe-3 tabular-nums">{row.sent_count}</td>
                      <td className="py-3 pe-3 tabular-nums">{row.failed_count}</td>
                      <td className="py-3 tabular-nums">{row.skipped_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
