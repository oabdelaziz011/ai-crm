import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { CalendarView } from "@/lib/calendar/types/calendar-view-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const DESKTOP_VIEWS: CalendarView[] = ["day", "week", "month", "agenda", "timeline"];
const MOBILE_VIEWS: CalendarView[] = ["agenda", "day", "week", "month"];

type CalendarViewSwitcherProps = {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
};

export function CalendarViewSwitcher({ view, onViewChange }: CalendarViewSwitcherProps) {
  const { t } = useTranslation("common");
  const isMobile = useIsMobile();
  const views = isMobile ? MOBILE_VIEWS : DESKTOP_VIEWS;

  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-background p-0.5">
      {views.map((item) => (
        <Button
          key={item}
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onViewChange(item)}
          className={cn(
            "h-8 rounded-sm px-3 text-xs",
            view === item && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          )}
        >
          {t(`calendar.views.${item}`)}
        </Button>
      ))}
    </div>
  );
}

export function CalendarToolbarActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
