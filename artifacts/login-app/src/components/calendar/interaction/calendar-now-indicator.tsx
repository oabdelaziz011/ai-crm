import { cn } from "@/lib/utils";

type CalendarNowIndicatorProps = {
  percent: number | null;
  orientation?: "vertical" | "horizontal";
  className?: string;
};

export function CalendarNowIndicator({
  percent,
  orientation = "vertical",
  className,
}: CalendarNowIndicatorProps) {
  if (percent == null) return null;

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute z-20", className)}
      style={
        orientation === "vertical"
          ? { top: `${percent}%`, left: 0, right: 0 }
          : { left: `${percent}%`, top: 0, bottom: 0 }
      }
    >
      <div
        className={
          orientation === "vertical"
            ? "h-0.5 bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]"
            : "w-0.5 h-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]"
        }
      />
    </div>
  );
}
