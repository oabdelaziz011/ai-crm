import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import type { AgendaDayGroup } from "@/hooks/calendar/use-agenda-groups";
import { CalendarAgendaEventRow } from "@/components/calendar/events/calendar-agenda-event-row";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type CalendarAgendaDayGroupProps = {
  group: AgendaDayGroup;
  todayDate: string;
  selectedEventId?: string | null;
  onEventClick?: (event: CalendarEvent) => void;
  sticky?: boolean;
};

export function CalendarAgendaDayGroup({
  group,
  todayDate,
  selectedEventId,
  onEventClick,
  sticky = true,
}: CalendarAgendaDayGroupProps) {
  const { t } = useTranslation("common");
  const parsed = parseISO(`${group.date}T12:00:00`);
  const isToday = group.date === todayDate;

  return (
    <section aria-labelledby={`agenda-day-${group.date}`} className="space-y-2">
      <div
        id={`agenda-day-${group.date}`}
        className={cn(
          "px-1 py-2 text-sm font-semibold border-b border-border/60 bg-background backdrop-blur-sm",
          sticky && "sticky top-0 z-10",
          isToday && "text-primary",
        )}
      >
        {format(parsed, "EEEE, MMM d")}
        {isToday && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t("calendar.navigation.today")}
          </span>
        )}
      </div>
      {group.isEmpty ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">{t("calendar.agenda.emptyDay")}</p>
      ) : (
        <div className="space-y-2 px-1" role="list">
          {group.events.map((event) => (
            <CalendarAgendaEventRow
              key={`${event.id}-${event.version}`}
              event={event}
              selected={selectedEventId === event.id}
              onClick={onEventClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}
