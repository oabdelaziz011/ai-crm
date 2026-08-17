import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, Archive, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useRoute } from "wouter";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useNotificationById } from "@/hooks/notifications/use-notification-by-id";
import { useNotificationActions } from "@/hooks/notifications/use-notification-actions";
import { useNotificationEntityLabels } from "@/hooks/notifications/use-notification-entity-labels";
import { localizeNotification, parseNotificationPayload } from "@/lib/notification-i18n";
import { notificationToLegacyItem } from "@/lib/notifications";
import { resolveNotificationHref } from "@/lib/notifications/resolve-notification-href";

export function NotificationDetailPage() {
  const { t, i18n } = useTranslation("common");
  const { company } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/notifications/:notificationId");
  const notificationId = params?.notificationId ?? null;
  const companyId = company?.id ?? null;
  const dateLocale = i18n.language === "ar" ? ar : enUS;
  const markedRef = useRef<string | null>(null);

  const { data: notification, isLoading, error } = useNotificationById(companyId, notificationId);
  const { markRead, archive } = useNotificationActions(companyId);
  const notificationList = useMemo(() => (notification ? [notification] : []), [notification]);
  const entityLabels = useNotificationEntityLabels(companyId, notificationList);

  useEffect(() => {
    if (!notification || notification.isRead) return;
    if (markedRef.current === notification.id) return;
    markedRef.current = notification.id;
    markRead.mutate(notification.id);
  }, [notification, markRead]);

  if (!companyId) {
    return <DashboardErrorBanner message={t("notifications.noCompany")} />;
  }

  if (isLoading) {
    return (
      <DashboardCard className="p-6">
        <DashboardTableSkeleton rows={4} />
      </DashboardCard>
    );
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  if (!notification) {
    return <DashboardErrorBanner message={t("notifications.detail.notFound")} />;
  }

  const localized = localizeNotification(t, notificationToLegacyItem(notification), entityLabels, {
    event: notification.event,
    category: notification.category,
  });
  const payload = parseNotificationPayload(notification.messagePayload);
  const relatedHref = resolveNotificationHref(notification);
  const detailSelf = `~/dashboard/notifications/${notification.id}`;
  const hasRelated = relatedHref !== detailSelf;

  const detailParams = Object.fromEntries(
    Object.entries(payload.params ?? {}).filter(
      ([key, value]) =>
        Boolean(value?.trim()) &&
        !["title", "body", "detail", "navigationTarget", "correlationId", "severity", "recipientRole"].includes(
          key,
        ),
    ),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="size-4 me-1 rtl:rotate-180" />
          {t("notifications.detail.back")}
        </Button>
      </div>

      <DashboardCard className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {t(`notifications.category.${notification.category}`, {
                  defaultValue: notification.category,
                })}
              </Badge>
              <Badge variant={notification.isRead ? "secondary" : "default"}>
                {notification.isRead
                  ? t("notifications.detail.read")
                  : t("notifications.detail.unread")}
              </Badge>
            </div>
            <h1 className="text-xl font-semibold break-words">{localized.title}</h1>
            <p className="text-sm text-muted-foreground" dir="ltr">
              {format(new Date(notification.createdAt), "PPpp", { locale: dateLocale })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={archive.isPending}
              onClick={() => {
                archive.mutate(notification.id, {
                  onSuccess: () => setLocation("~/dashboard"),
                });
              }}
            >
              <Archive className="size-3.5 me-1" />
              {t("notifications.platform.archive")}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-muted/30 p-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{localized.message}</p>
        </div>

        {Object.keys(detailParams).length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("notifications.detail.details")}</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              {Object.entries(detailParams).map(([key, value]) => (
                <div key={key} className="overflow-hidden rounded-md border px-3 py-2">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{key}</dt>
                  <dd className="text-sm break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {hasRelated ? (
          <Button asChild>
            <Link href={relatedHref}>
              <ExternalLink className="size-3.5 me-1" />
              {t("notifications.detail.openRelated")}
            </Link>
          </Button>
        ) : null}
      </DashboardCard>
    </div>
  );
}

export default NotificationDetailPage;
