import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { NotificationListFilter, NotificationPriority } from "@/lib/notifications/types";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/types/notification-enums";

type NotificationFiltersProps = {
  filter: NotificationListFilter;
  onChange: (filter: NotificationListFilter) => void;
};

export function NotificationFilters({ filter, onChange }: NotificationFiltersProps) {
  const { t } = useTranslation("common");

  const unreadOnly = filter.unreadOnly ?? false;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/50">
      <Button
        variant={unreadOnly ? "default" : "outline"}
        size="sm"
        className="h-7 text-xs"
        onClick={() => onChange({ ...filter, unreadOnly: !unreadOnly })}
      >
        {t("notifications.platform.filters.unread")}
      </Button>

      <Select
        value={filter.priority ?? "all"}
        onValueChange={(value) =>
          onChange({
            ...filter,
            priority: value as NotificationPriority | "all",
          })
        }
      >
        <SelectTrigger className="h-7 w-[120px] text-xs border-white/10">
          <SelectValue placeholder={t("notifications.platform.filters.priority")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("notifications.platform.filters.allPriorities")}</SelectItem>
          <SelectItem value="urgent">{t("notifications.platform.priority.urgent")}</SelectItem>
          <SelectItem value="high">{t("notifications.platform.priority.high")}</SelectItem>
          <SelectItem value="normal">{t("notifications.platform.priority.normal")}</SelectItem>
          <SelectItem value="low">{t("notifications.platform.priority.low")}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filter.event ?? "all"}
        onValueChange={(value) =>
          onChange({
            ...filter,
            event: value as NotificationListFilter["event"],
          })
        }
      >
        <SelectTrigger className="h-7 w-[140px] text-xs border-white/10">
          <SelectValue placeholder={t("notifications.platform.filters.type")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("notifications.platform.filters.allTypes")}</SelectItem>
          {NOTIFICATION_EVENTS.map((event) => (
            <SelectItem key={event} value={event}>
              {t(`notifications.platform.events.${event}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={filter.sort === "oldest" ? "default" : "outline"}
        size="sm"
        className="h-7 text-xs ms-auto"
        onClick={() =>
          onChange({
            ...filter,
            sort: filter.sort === "oldest" ? "newest" : "oldest",
          })
        }
      >
        {filter.sort === "oldest"
          ? t("notifications.platform.filters.oldest")
          : t("notifications.platform.filters.newest")}
      </Button>
    </div>
  );
}

export function useDefaultNotificationFilter(): NotificationListFilter {
  return useMemo(
    () => ({
      unreadOnly: false,
      priority: "all",
      event: "all",
      includeArchived: false,
      sort: "newest",
    }),
    [],
  );
}
