import { format, parseISO } from "date-fns";
import { ar, enUS } from "date-fns/locale";
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
  const { t, i18n } = useTranslation("common");
  const dateLocale = i18n.language?.startsWith("ar") ? ar : enUS;
  const selected = parseISO(`${anchorDate}T12:00:00`);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showTimezoneHint = displayTimezone !== browserTz;

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={onToday} className="border-border bg-background">
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
            className={cn("min-w-[160px] justify-center border-border bg-background font-medium")}
          >
            {label ?? format(selected, "MMM d, yyyy", { locale: dateLocale })}
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
        <span className="ms-1 hidden text-xs text-muted-foreground sm:inline">{displayTimezone}</span>
      )}
    </div>
  );
}
