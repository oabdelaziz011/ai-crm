import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { localizeNotification, type NotificationEntityLabels } from "@/lib/notification-i18n";
import { notificationToLegacyItem } from "@/lib/notifications";
import type { Notification } from "@/lib/notifications/types";

type NotificationListItemProps = {
  notification: Notification;
  onOpen?: (notification: Notification) => void;
  busy?: boolean;
  entityLabels?: NotificationEntityLabels;
};

export function NotificationListItem({ notification, onOpen, busy, entityLabels }: NotificationListItemProps) {
  const { t, i18n } = useTranslation("common");
  const localized = localizeNotification(t, notificationToLegacyItem(notification), entityLabels, {
    event: notification.event,
    category: notification.category,
  });
  const dateLocale = i18n.language === "ar" ? ar : enUS;
  const unread = !notification.isRead;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onOpen?.(notification)}
      className={cn(
        "w-full px-3 py-3 text-start transition-colors border-b border-border/40 last:border-b-0",
        unread
          ? "bg-primary/10 shadow-[inset_3px_0_0_0_hsl(var(--primary))] hover:bg-primary/15"
          : "hover:bg-muted/50 opacity-80",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            unread ? "bg-primary shadow-[0_0_8px_hsl(var(--primary))]" : "bg-muted-foreground/30",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-sm truncate", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {localized.title}
            </p>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
              {t(`notifications.category.${notification.category}`, { defaultValue: notification.category })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 break-words whitespace-pre-wrap">
            {localized.message}
          </p>
          <p className="text-[11px] text-muted-foreground" dir="ltr">
            {format(new Date(notification.createdAt), "PPp", { locale: dateLocale })}
          </p>
        </div>
      </div>
    </button>
  );
}
