import { useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { campaignListHref } from "@/config/campaigns-route-registry";
import { useCampaignDetail } from "@/hooks/campaigns/use-campaigns";
import type { MarketingCampaignChannel } from "@/lib/campaigns";
import {
  campaignStatusLabelKey,
  channelLabelKey,
  overallCampaignResultKind,
  recipientStatusLabelKey,
  skipReasonLabelKey,
} from "@/lib/campaigns/campaign-ui-presentation";

export function CampaignDetailPage() {
  const { t } = useTranslation("common");
  const params = useParams<{ campaignId?: string }>();
  const [, setLocation] = useLocation();
  const campaignId = params.campaignId ?? null;
  const { data, isLoading, error } = useCampaignDetail(campaignId, Boolean(campaignId));

  const channelSummary = useMemo(() => {
    const recipients = data?.recipients ?? [];
    const map = new Map<
      MarketingCampaignChannel,
      { total: number; queued: number; sent: number; failed: number; skipped: number }
    >();
    for (const row of recipients) {
      const bucket = map.get(row.channel) ?? {
        total: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
      };
      bucket.total += 1;
      if (row.status === "queued") bucket.queued += 1;
      if (row.status === "sent") bucket.sent += 1;
      if (row.status === "failed") bucket.failed += 1;
      if (row.status === "skipped") bucket.skipped += 1;
      map.set(row.channel, bucket);
    }
    return [...map.entries()];
  }, [data?.recipients]);

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

  const campaign = data?.campaign;
  if (!campaign) {
    return <DashboardErrorBanner message={t("campaigns.detail.notFound")} />;
  }

  const content = campaign.content_definition ?? {};
  const kind = overallCampaignResultKind({
    status: campaign.status,
    queued: campaign.queued_count,
    sent: campaign.sent_count,
    failed: campaign.failed_count,
    skipped: campaign.skipped_count,
  });

  return (
    <div className="space-y-4" data-testid="campaign-detail">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{campaign.name}</h2>
          <p className="text-sm text-muted-foreground">
            {t("campaigns.detail.createdAt", {
              date: new Date(campaign.created_at).toLocaleString(),
            })}
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation(campaignListHref())}>
          {t("campaigns.detail.back")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard className="space-y-3 p-5">
          <h3 className="font-semibold">{t("campaigns.detail.overview")}</h3>
          <div className="flex flex-wrap gap-2">
            <Badge variant={kind === "failed" ? "destructive" : "outline"}>
              {kind === "partial"
                ? t("campaigns.status.partial")
                : t(campaignStatusLabelKey(campaign.status))}
            </Badge>
            {campaign.channels.map((channel) => (
              <Badge key={channel} variant="secondary">
                {t(channelLabelKey(channel))}
              </Badge>
            ))}
          </div>
          <p className="text-sm">
            {t(`campaigns.audienceType.${campaign.audience_type}`)} ·{" "}
            {t("campaigns.detail.totals", {
              total: campaign.total_recipients_count,
              queued: campaign.queued_count,
              sent: campaign.sent_count,
              failed: campaign.failed_count,
              skipped: campaign.skipped_count,
            })}
          </p>
          <p className="text-xs text-muted-foreground">{t("campaigns.detail.queuedVsSent")}</p>
        </DashboardCard>

        <DashboardCard className="space-y-3 p-5">
          <h3 className="font-semibold">{t("campaigns.detail.content")}</h3>
          <p className="text-sm font-medium">
            {typeof content.campaignTitle === "string" ? content.campaignTitle : "—"}
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {typeof content.detail === "string" ? content.detail : "—"}
          </p>
        </DashboardCard>
      </div>

      <DashboardCard className="space-y-3 p-5">
        <h3 className="font-semibold">{t("campaigns.detail.channelSummary")}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {channelSummary.map(([channel, counts]) => (
            <div key={channel} className="rounded-md border p-3 text-sm space-y-1">
              <p className="font-medium">{t(channelLabelKey(channel))}</p>
              <p>
                {t("campaigns.detail.channelCounts", {
                  total: counts.total,
                  queued: counts.queued,
                  sent: counts.sent,
                  failed: counts.failed,
                  skipped: counts.skipped,
                })}
              </p>
            </div>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard className="space-y-3 p-5">
        <h3 className="font-semibold">{t("campaigns.detail.recipients")}</h3>
        {(data?.recipients.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t("campaigns.detail.recipientsEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pe-3 text-start font-medium">
                    {t("campaigns.detail.columns.customer")}
                  </th>
                  <th className="py-2 pe-3 text-start font-medium">
                    {t("campaigns.detail.columns.channel")}
                  </th>
                  <th className="py-2 pe-3 text-start font-medium">
                    {t("campaigns.detail.columns.status")}
                  </th>
                  <th className="py-2 pe-3 text-start font-medium">
                    {t("campaigns.detail.columns.reason")}
                  </th>
                  <th className="py-2 pe-3 text-start font-medium">
                    {t("campaigns.detail.columns.providerId")}
                  </th>
                  <th className="py-2 text-start font-medium">
                    {t("campaigns.detail.columns.updated")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data!.recipients.map((row) => {
                  const reasonKey = skipReasonLabelKey(row.error_message);
                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pe-3 font-mono text-xs">{row.customer_id}</td>
                      <td className="py-2 pe-3">{t(channelLabelKey(row.channel))}</td>
                      <td className="py-2 pe-3">
                        <Badge variant="outline">{t(recipientStatusLabelKey(row.status))}</Badge>
                      </td>
                      <td className="py-2 pe-3 text-muted-foreground">
                        {row.status === "skipped" || row.status === "failed"
                          ? t(reasonKey ?? "campaigns.skipReasons.generic")
                          : "—"}
                      </td>
                      <td className="py-2 pe-3 font-mono text-xs">
                        {row.provider_message_id ?? row.notification_queue_id ?? "—"}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {new Date(row.updated_at).toLocaleString()}
                      </td>
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
