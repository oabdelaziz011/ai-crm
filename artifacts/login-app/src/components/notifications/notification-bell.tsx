import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationDrawer } from "@/components/notifications/notification-drawer";
import { useNotificationsRealtime } from "@/hooks/notifications/use-notifications";
import { useUnreadNotifications } from "@/hooks/notifications/use-unread-notifications";

type NotificationBellProps = {
  companyId: string | null;
};

export function NotificationBell({ companyId }: NotificationBellProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadNotifications(companyId);

  useNotificationsRealtime(companyId);

  return (
    <>
      <button
        type="button"
        className="relative flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-background/60"
        aria-label={t("notifications.title")}
        onClick={() => setOpen(true)}
      >
        <Bell className="size-4 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -end-1 -top-1 min-w-[16px] h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <NotificationDrawer companyId={companyId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export { NotificationBell as NotificationsBell };
