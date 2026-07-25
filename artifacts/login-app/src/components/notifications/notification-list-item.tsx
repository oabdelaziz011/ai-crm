import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Archive, MailOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { localizeNotification } from "@/lib/notification-i18n";
import { notificationToLegacyItem } from "@/lib/notifications";
import type { Notification } from "@/lib/notifications/types";

type NotificationListItemProps = {
  notification: Notification;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onArchive?: (id: string) => void;
  busy?: boolean;
};

function PriorityDot({ priority }: { priority: Notification["priority"] }) {
  const cls =
    priority === "urgent"
      ? "bg-rose-400"
      : priority === "high"
        ? "bg-amber-400"
        : priority === "normal"
          ? "bg-sky-400"
          : "bg-muted-foreground/50";
  return <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

export function NotificationListItem({
  notification,
  onMarkRead,
  onMarkUnread,
  onArchive,
  busy,
}: NotificationListItemProps) {
  const { t, i18n } = useTranslation("common");
  const localized = localizeNotification(t, notificationToLegacyItem(notification));
  const dateLocale = i18n.language === "ar" ? ar : enUS;

  return (
    <div className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-start gap-3">
        <PriorityDot priority={notification.priority} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p
              className={`text-sm truncate ${notification.isRead ? "text-muted-foreground" : "font-semibold"}`}
            >
              {localized.title}
            </p>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
              {t(`notifications.category.${notification.category}`, notification.category)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words">
            {localized.message}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1" dir="ltr">
            {format(new Date(notification.createdAt), "PPp", { locale: dateLocale })}
          </p>
          <div className="flex items-center gap-2 mt-2">
            {notification.isRead ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs border-white/10"
                disabled={busy}
                onClick={() => onMarkUnread?.(notification.id)}
              >
                <MailOpen className="w-3.5 h-3.5 me-1" />
                {t("notifications.platform.markUnread")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs border-white/10"
                disabled={busy}
                onClick={() => onMarkRead?.(notification.id)}
              >
                {t("notifications.markRead")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              disabled={busy}
              onClick={() => onArchive?.(notification.id)}
            >
              <Archive className="w-3.5 h-3.5 me-1" />
              {t("notifications.platform.archive")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
