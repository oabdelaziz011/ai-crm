import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Calendar } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarDayButton } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { findDatePickerConstraint } from "@/lib/scheduling/business-calendar";
import type { DatePickerConstraintsSnapshot, HolidayBehavior } from "@/lib/scheduling/business-calendar";
import type { DayButton } from "react-day-picker";

type DatePickerCalendarPreviewProps = {
  constraints: DatePickerConstraintsSnapshot;
  holidayBehavior: HolidayBehavior;
};

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function PreviewDayButton({
  constraints,
  holidayBehavior,
  ...props
}: React.ComponentProps<typeof DayButton> & {
  constraints: DatePickerConstraintsSnapshot;
  holidayBehavior: HolidayBehavior;
}) {
  const { t } = useTranslation("common");
  const isoDate = formatIsoDate(props.day.date);
  const entry = findDatePickerConstraint(constraints, isoDate);
  const isDisabled = constraints.disabledDates.includes(isoDate);
  const isWarning = constraints.warningDates.includes(isoDate);

  const message = entry
    ? t(entry.messageKey, {
        defaultValue: entry.reason.replace(/_/g, " "),
        ...(entry.messageParams ?? {}),
      })
    : null;

  const button = (
    <CalendarDayButton
      {...props}
      disabled={isDisabled || props.disabled}
      className={cn(
        props.className,
        isDisabled && "opacity-40",
        isWarning && "border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    />
  );

  if (!message) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {message}
        {isWarning && holidayBehavior === "warning"
          ? ` · ${t("workflowBuilder.datePicker.warningSelectable")}`
          : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function DatePickerCalendarPreview({
  constraints,
  holidayBehavior,
}: DatePickerCalendarPreviewProps) {
  const disabledMatchers = useMemo(
    () => constraints.disabledDates.map((date) => new Date(`${date}T12:00:00`)),
    [constraints.disabledDates],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-2xl border border-border/50 bg-background/70 p-2">
        <Calendar
          mode="single"
          disabled={disabledMatchers}
          components={{
            DayButton: (props) => (
              <PreviewDayButton
                {...props}
                constraints={constraints}
                holidayBehavior={holidayBehavior}
              />
            ),
          }}
        />
        <div className="mt-2 flex flex-wrap gap-3 px-2 pb-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-muted opacity-40" />
            Disabled
          </span>
          {holidayBehavior === "warning" ? (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm border border-amber-500/50 bg-amber-500/10" />
              Holiday warning
            </span>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
