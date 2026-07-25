import { useMemo, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
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
  NotificationFilters,
  useDefaultNotificationFilter,
} from "@/components/notifications/notification-filters";
import { NotificationList } from "@/components/notifications/notification-list";
import { useNotificationsInfinite } from "@/hooks/notifications/use-notifications";
import { useNotificationActions } from "@/hooks/notifications/use-notification-actions";
import { useUnreadNotifications } from "@/hooks/notifications/use-unread-notifications";
import type { NotificationListFilter } from "@/lib/notifications/types";

type NotificationDrawerProps = {
  companyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NotificationDrawer({ companyId, open, onOpenChange }: NotificationDrawerProps) {
  const { t } = useTranslation("common");
  const defaultFilter = useDefaultNotificationFilter();
  const [filter, setFilter] = useState<NotificationListFilter>(defaultFilter);

  const { data: unreadCount = 0 } = useUnreadNotifications(companyId);
  const { markRead, markUnread, markAllRead, archive } = useNotificationActions(companyId);

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

  const busy =
    markRead.isPending ||
    markUnread.isPending ||
    markAllRead.isPending ||
    archive.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 bg-card/95 border-white/10 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b border-white/10 text-start">
          <SheetTitle>{t("notifications.title")}</SheetTitle>
          <SheetDescription>{t("notifications.unread", { count: unreadCount })}</SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={!companyId || unreadCount === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
          >
            {markAllRead.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5" />
            )}
            <span className="ms-1">{t("notifications.markAllRead")}</span>
          </Button>
        </div>

        <NotificationFilters filter={filter} onChange={setFilter} />

        <div className="flex-1 overflow-y-auto">
          {!companyId ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("notifications.noCompany")}</p>
          ) : (
            <NotificationList
              items={items}
              isLoading={isLoading}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage}
              onLoadMore={() => void fetchNextPage()}
              onMarkRead={(id) => markRead.mutate(id)}
              onMarkUnread={(id) => markUnread.mutate(id)}
              onArchive={(id) => archive.mutate(id)}
              busy={busy}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
