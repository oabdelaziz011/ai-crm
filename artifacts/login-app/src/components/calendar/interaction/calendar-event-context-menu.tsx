import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type CalendarEventContextMenuProps = {
  event: CalendarEvent;
  children: ReactNode;
  onOpenBooking?: (event: CalendarEvent) => void;
  onOpenCustomer?: (event: CalendarEvent) => void;
  onReschedule?: (event: CalendarEvent) => void;
  onComplete?: (event: CalendarEvent) => void;
  onCancel?: (event: CalendarEvent) => void;
};

export function CalendarEventContextMenu({
  event,
  children,
  onOpenBooking,
  onOpenCustomer,
  onReschedule,
  onComplete,
  onCancel,
}: CalendarEventContextMenuProps) {
  const { t } = useTranslation("common");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => onOpenBooking?.(event)}>
          {t("calendar.interaction.openBooking")}
        </ContextMenuItem>
        {event.customer?.id && (
          <ContextMenuItem onClick={() => onOpenCustomer?.(event)}>
            {t("calendar.interaction.openCustomer")}
          </ContextMenuItem>
        )}
        {event.permissions.canEdit && (
          <ContextMenuItem onClick={() => onReschedule?.(event)}>
            {t("calendar.interaction.reschedule")}
          </ContextMenuItem>
        )}
        {event.permissions.canComplete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onComplete?.(event)}>
              {t("calendar.interaction.complete")}
            </ContextMenuItem>
          </>
        )}
        {event.permissions.canCancel && (
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onCancel?.(event)}
          >
            {t("calendar.interaction.cancel")}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
