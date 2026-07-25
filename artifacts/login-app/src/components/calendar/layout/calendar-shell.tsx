import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CalendarShellProps = {
  toolbar: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function CalendarShell({ toolbar, filters, children, className }: CalendarShellProps) {
  return (
    <section
      aria-label="Calendar"
      className={cn("flex flex-col gap-4", className)}
    >
      {toolbar}
      {filters}
      <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden min-h-[520px]">
        {children}
      </div>
    </section>
  );
}
