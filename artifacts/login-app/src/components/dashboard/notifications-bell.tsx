import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationsRead,
  useNotifications,
  useNotificationsRealtime,
  useUnreadNotificationsCount,
} from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { localizeNotification } from "@/lib/notification-i18n";
import type { NotificationItem } from "@/lib/types";

function NotificationTypeDot({ type }: { type: NotificationItem["type"] }) {
  const cls =
    type === "error"
      ? "bg-rose-400"
      : type === "warning"
        ? "bg-amber-400"
        : type === "success"
          ? "bg-emerald-400"
          : "bg-sky-400";

  return <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

export function NotificationsBell({ companyId }: { companyId: string | null }) {
  const { t, i18n: i18nInstance } = useTranslation("common");
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  const {
    data: notificationsResponse,
    isLoading,
  } = useNotifications(companyId, page);
  const { data: unreadCount = 0 } = useUnreadNotificationsCount(companyId);
  const markOne = useMarkNotificationRead(companyId);
  const markVisible = useMarkNotificationsRead(companyId);
  const markAll = useMarkAllNotificationsRead(companyId);
  const removeOne = useDeleteNotification(companyId);
  const markedOnOpenRef = useRef<string | null>(null);

  useNotificationsRealtime(companyId);

  const items = notificationsResponse?.items ?? [];
  const total = notificationsResponse?.total ?? 0;
  const pageSize = notificationsResponse?.pageSize ?? 8;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canLoad = Boolean(companyId);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!open) {
      markedOnOpenRef.current = null;
      return;
    }

    if (!canLoad || isLoading) {
      return;
    }

    const unreadIds = items.filter((item) => !item.is_read).map((item) => item.id);
    if (unreadIds.length === 0) {
      return;
    }

    const signature = unreadIds.join(",");
    if (markedOnOpenRef.current === signature) {
      return;
    }

    markedOnOpenRef.current = signature;
    markVisible.mutate(unreadIds);
  }, [open, canLoad, isLoading, items, markVisible]);

  const titleByCategory = useMemo(
    () => ({
      booking: t("notifications.category.booking"),
      invoice: t("notifications.category.invoice"),
      subscription: t("notifications.category.subscription"),
      whatsapp: t("notifications.category.whatsapp"),
      system: t("notifications.category.system"),
    }),
    [t],
  );

  const dateLocale = i18nInstance.language === "ar" ? ar : enUS;

  const onMarkAsRead = (id: string) => {
    markOne.mutate(id, {
      onError: (error) => {
        toast({ title: t("notifications.errors.readFailed"), description: error.message });
      },
    });
  };

  const onMarkAllAsRead = () => {
    markAll.mutate(undefined, {
      onError: (error) => {
        toast({ title: t("notifications.errors.markAllFailed"), description: error.message });
      },
    });
  };

  const onDelete = (id: string) => {
    removeOne.mutate(id, {
      onError: (error) => {
        toast({ title: t("notifications.errors.deleteFailed"), description: error.message });
      },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
          aria-label={t("notifications.title")}
        >
          <Bell className="w-4 h-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -end-1 -top-1 min-w-[16px] h-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-80 sm:w-96 max-w-[92vw] p-0 bg-card/95 border-white/10 rounded-xl shadow-2xl backdrop-blur-sm overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{t("notifications.title")}</p>
            <p className="text-xs text-muted-foreground">{t("notifications.unread", { count: unreadCount })}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={onMarkAllAsRead}
            disabled={!canLoad || unreadCount === 0 || markAll.isPending}
          >
            {markAll.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            <span className="ms-1">{t("notifications.markAllRead")}</span>
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/5">
          {!canLoad ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("notifications.noCompany")}</p>
          ) : isLoading ? (
            <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("notifications.loading")}
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("notifications.empty")}</p>
          ) : (
            items.map((item) => {
              const localized = localizeNotification(t, item);
              return (
              <div key={item.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start gap-3">
                  <NotificationTypeDot type={item.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${item.is_read ? "text-muted-foreground" : "font-semibold"}`}>{localized.title}</p>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {titleByCategory[item.category]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words">{localized.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-1" dir="ltr">
                      {format(new Date(item.created_at), "PPp", { locale: dateLocale })}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs border-white/10"
                        disabled={item.is_read || markOne.isPending}
                        onClick={() => onMarkAsRead(item.id)}
                      >
                        {t("notifications.markRead")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                        disabled={removeOne.isPending}
                        onClick={() => onDelete(item.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="ms-1">{t("notifications.delete")}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
            })
          )}
        </div>

        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("notifications.pagination.pageInfo", {
              page,
              totalPages,
              total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs border-white/10"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              {t("notifications.pagination.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs border-white/10"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              {t("notifications.pagination.next")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
