import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type CalendarNavigationControlsProps = {
  anchorDate: string;
  displayTimezone: string;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onJumpToDate: (date: string) => void;
  label?: string;
};

export function CalendarNavigationControls({
  anchorDate,
  displayTimezone,
  onToday,
  onPrevious,
  onNext,
  onJumpToDate,
  label,
}: CalendarNavigationControlsProps) {
  const { t } = useTranslation("common");
  const selected = parseISO(`${anchorDate}T12:00:00`);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showTimezoneHint = displayTimezone !== browserTz;

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={onToday} className="border-white/10">
        {t("calendar.navigation.today")}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("border-white/10 min-w-[160px] justify-center font-medium")}
          >
            {label ?? format(selected, "MMM d, yyyy")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              onJumpToDate(format(date, "yyyy-MM-dd"));
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      {showTimezoneHint && (
        <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">
          {displayTimezone}
        </span>
      )}
    </div>
  );
}
