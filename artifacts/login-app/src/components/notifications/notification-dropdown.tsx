import { useMemo, useState, type ReactNode } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  NotificationFilters,
  useDefaultNotificationFilter,
} from "@/components/notifications/notification-filters";
import { NotificationList } from "@/components/notifications/notification-list";
import { useNotificationsInfinite } from "@/hooks/notifications/use-notifications";
import { useNotificationActions } from "@/hooks/notifications/use-notification-actions";
import { useNotificationEntityLabels } from "@/hooks/notifications/use-notification-entity-labels";
import { useUnreadNotifications } from "@/hooks/notifications/use-unread-notifications";
import { resolveNotificationHref } from "@/lib/notifications/resolve-notification-href";
import type { Notification, NotificationListFilter } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

type NotificationDropdownProps = {
  companyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
};

export function NotificationDropdown({
  companyId,
  open,
  onOpenChange,
  trigger,
}: NotificationDropdownProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const defaultFilter = useDefaultNotificationFilter();
  const [filter, setFilter] = useState<NotificationListFilter>(defaultFilter);

  const { data: unreadCount = 0 } = useUnreadNotifications(companyId);
  const { markRead, markAllRead } = useNotificationActions(companyId);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useNotificationsInfinite(companyId, filter);

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data?.pages],
  );
  const entityLabels = useNotificationEntityLabels(companyId, items);

  const busy = markRead.isPending || markAllRead.isPending;

  const handleOpen = async (notification: Notification) => {
    onOpenChange(false);
    if (!notification.isRead) {
      try {
        await markRead.mutateAsync(notification.id);
      } catch {
        // Navigation still proceeds; unread count refreshes on settle.
      }
    }
    setLocation(resolveNotificationHref(notification));
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn(
          "w-[min(100vw-1.5rem,24rem)] p-0 overflow-hidden",
          "border-border/70 bg-popover shadow-xl",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b px-3 py-3">
          <div>
            <p className="text-sm font-semibold">{t("notifications.title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("notifications.unread", { count: unreadCount })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-xs"
            disabled={!companyId || unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {markAllRead.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCheck className="size-3.5" />
            )}
            <span className="ms-1">{t("notifications.markAllRead")}</span>
          </Button>
        </div>

        <NotificationFilters filter={filter} onChange={setFilter} />

        <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
          {!companyId ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("notifications.noCompany")}</p>
          ) : (
            <NotificationList
              items={items}
              isLoading={isLoading}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage}
              onLoadMore={() => void fetchNextPage()}
              onOpen={(notification) => void handleOpen(notification)}
              busy={busy}
              entityLabels={entityLabels}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
