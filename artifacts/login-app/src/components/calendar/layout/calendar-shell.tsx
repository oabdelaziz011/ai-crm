import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CalendarShellProps = {
  toolbar: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Full-height calendar chrome — grid stretches to the bottom of the main pane. */
export function CalendarShell({ toolbar, filters, children, className }: CalendarShellProps) {
  return (
    <section
      aria-label="Calendar"
      className={cn("flex min-h-0 flex-1 flex-col gap-3 bg-background", className)}
    >
      <div className="shrink-0 space-y-3">{toolbar}</div>
      {filters ? <div className="shrink-0">{filters}</div> : null}
      <div className="min-h-0 flex-1 overflow-hidden border border-border bg-background">
        {children}
      </div>
    </section>
  );
}
