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
    <div className="inline-flex flex-wrap rounded-lg border border-white/10 p-0.5 bg-black/20">
      {views.map((item) => (
        <Button
          key={item}
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onViewChange(item)}
          className={cn(
            "h-8 px-3 text-xs rounded-md",
            view === item && "bg-white/10 text-foreground",
          )}
        >
          {t(`calendar.views.${item}`)}
        </Button>
      ))}
    </div>
  );
}
