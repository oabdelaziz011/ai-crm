import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type QueryRefreshIndicatorProps = {
  active: boolean;
  className?: string;
  label?: string;
};

/** Subtle non-blocking indicator for background query refresh. */
export function QueryRefreshIndicator({
  active,
  className,
  label = "Refreshing",
}: QueryRefreshIndicatorProps) {
  if (!active) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2 py-0.5",
        "text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
      <span>{label}</span>
    </div>
  );
}
