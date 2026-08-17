import type { CSSProperties, ElementType, KeyboardEvent, ReactNode } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

export function DashboardCard({
  children,
  className = "",
  style,
  onClick,
  role,
  tabIndex,
  onKeyDown,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  role?: string;
  tabIndex?: number;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.24),0_0_0_1px_hsl(var(--card-border)/0.5)]",
        "transition-shadow duration-150 hover:shadow-[0_4px_16px_-2px_rgba(0,0,0,0.32)]",
        className,
      )}
      style={style}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export function DashboardStatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendUp,
  loading,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  trend?: string;
  trendUp?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <DashboardCard
      className={cn(
        "group relative overflow-hidden p-5",
        onClick && "cursor-pointer transition-colors hover:border-primary/30",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="pointer-events-none absolute -end-4 -top-4 size-24 rounded-full bg-primary/5 transition-transform duration-300 group-hover:scale-110" />

      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2 overflow-hidden">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          {loading ? (
            <div className="h-6 w-20 animate-pulse rounded-md bg-muted" />
          ) : (
            <p
              className="truncate whitespace-nowrap font-mono text-sm font-semibold leading-none tabular-nums tracking-tight text-foreground sm:text-[15px] lg:text-base"
              title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
            >
              {value}
            </p>
          )}
          {trend && !loading && (
            <p
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                trendUp ? "text-success" : "text-destructive",
              )}
            >
              {trendUp ? (
                <ArrowUpRight className="size-3.5 shrink-0" />
              ) : (
                <ArrowDownRight className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{trend}</span>
            </p>
          )}
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 sm:size-9">
          <Icon className="size-3.5 text-primary sm:size-4" />
        </div>
      </div>
    </DashboardCard>
  );
}

export function DashboardErrorBanner({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      <div className="flex items-center gap-3">
        <AlertCircle className="size-4 shrink-0" />
        <span>{message}</span>
      </div>
      {children}
    </div>
  );
}

export function DashboardTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}
