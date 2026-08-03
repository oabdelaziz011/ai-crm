import { memo } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspacePlatform } from "@/context/workspace-platform-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES = {
  urgent: "border-red-500/40 bg-red-500/10",
  high: "border-amber-500/40 bg-amber-500/10",
  normal: "border-border/60 bg-card/80",
  low: "border-border/40 bg-muted/30",
};

export const WorkspaceNotificationCenter = memo(function WorkspaceNotificationCenter() {
  const { t } = useTranslation("common");
  const {
    notificationsOpen,
    toggleNotifications,
    closeNotifications,
    snapshot,
    markNotificationRead,
    markAllNotificationsRead,
  } = useWorkspacePlatform();

  const unread = snapshot?.unreadCount ?? 0;
  const notifications = snapshot?.notifications ?? [];

  return (
    <Popover open={notificationsOpen} onOpenChange={(open) => !open && closeNotifications()}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative h-9 gap-2" onClick={toggleNotifications}>
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
          <span className="hidden sm:inline">{t("workspacePlatform.notifications.title")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t("workspacePlatform.notifications.title")}</p>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px]" onClick={markAllNotificationsRead}>
            <CheckCheck className="size-3" />
            {t("workspacePlatform.notifications.markAll")}
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => markNotificationRead(n.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2 text-start transition-opacity",
                PRIORITY_STYLES[n.priority],
                n.read && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold">{n.title}</p>
                {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{n.message}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
