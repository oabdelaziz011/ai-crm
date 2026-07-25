import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NotificationListItem } from "@/components/notifications/notification-list-item";
import type { Notification } from "@/lib/notifications/types";

type NotificationListProps = {
  items: Notification[];
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onArchive?: (id: string) => void;
  busy?: boolean;
};

export function NotificationList({
  items,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  onMarkRead,
  onMarkUnread,
  onArchive,
  busy,
}: NotificationListProps) {
  const { t } = useTranslation("common");
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasNextPage || !onLoadMore) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { rootMargin: "120px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  if (isLoading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("notifications.loading")}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">{t("notifications.empty")}</p>
    );
  }

  return (
    <div className="divide-y divide-white/5">
      {items.map((notification) => (
        <NotificationListItem
          key={notification.id}
          notification={notification}
          onMarkRead={onMarkRead}
          onMarkUnread={onMarkUnread}
          onArchive={onArchive}
          busy={busy}
        />
      ))}
      <div ref={sentinelRef} className="h-8 flex items-center justify-center">
        {isFetchingNextPage ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
    </div>
  );
}
