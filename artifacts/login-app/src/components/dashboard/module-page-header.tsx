import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared white module chrome — title, purpose line, optional actions. */
export function ModulePageHeader({
  title,
  subtitle,
  actions,
  className,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex flex-col border-b border-border/60 bg-background sm:flex-row sm:items-start sm:justify-between",
        compact ? "gap-1 pb-2" : "gap-3 pb-4",
        className,
      )}
    >
      <div className={cn("min-w-0", compact ? "space-y-0.5" : "space-y-1")}>
        <h1
          className={cn(
            "truncate font-semibold tracking-tight",
            compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={cn(
              "text-muted-foreground",
              compact ? "max-w-3xl truncate text-xs" : "max-w-2xl text-sm",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function ModuleSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-background",
        className,
      )}
    >
      {children}
    </div>
  );
}
