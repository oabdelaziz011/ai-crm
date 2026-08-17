import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { useNotificationsRealtime } from "@/hooks/notifications/use-notifications";
import { useUnreadNotifications } from "@/hooks/notifications/use-unread-notifications";
import { cn } from "@/lib/utils";

type NotificationBellProps = {
  companyId: string | null;
};

export function NotificationBell({ companyId }: NotificationBellProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadNotifications(companyId);

  useNotificationsRealtime(companyId);

  return (
    <NotificationDropdown
      companyId={companyId}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className={cn(
            "relative flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-background/60",
            open && "bg-background/60",
          )}
          aria-label={t("notifications.title")}
          aria-expanded={open}
        >
          <Bell className="size-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -end-1 -top-1 min-w-[16px] h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      }
    />
  );
}

export { NotificationBell as NotificationsBell };
