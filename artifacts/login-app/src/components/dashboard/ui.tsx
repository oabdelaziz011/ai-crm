import type { CSSProperties, ElementType, ReactNode } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight } from "lucide-react";

export { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";

export function DashboardCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`bg-card/40 border border-white/5 rounded-2xl backdrop-blur-sm ${className}`}
      style={style}
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
}: {
  label: string;
  value: string | number;
  icon: ElementType;
  trend?: string;
  trendUp?: boolean;
  loading?: boolean;
}) {
  return (
    <DashboardCard className="p-5 flex flex-col gap-4 hover:bg-card/60 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <div>
        {loading ? (
          <div className="h-7 w-16 bg-white/10 rounded animate-pulse" />
        ) : (
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        )}
        {trend && !loading && (
          <p
            className={`text-xs mt-1 flex items-center gap-1 ${trendUp ? "text-emerald-400" : "text-rose-400"}`}
          >
            {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend}
          </p>
        )}
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
    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
      <div className="flex items-center gap-3">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </div>
      {children}
    </div>
  );
}

export function DashboardTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-white/5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center px-6 py-4 gap-4">
          <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
            <div className="h-2.5 w-24 bg-white/5 rounded animate-pulse" />
          </div>
          <div className="h-5 w-16 bg-white/10 rounded-full animate-pulse" />
        </div>
      ))}
    </div>
  );
}
