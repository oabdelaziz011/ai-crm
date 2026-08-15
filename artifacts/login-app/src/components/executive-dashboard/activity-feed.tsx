import { memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, AlertTriangle, CheckCircle2, Info, Plug, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardCard } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type { ExecutiveActivityItemModel } from "@/lib/dashboard";

const TONE_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
} as const;

type ActivityItemProps = {
  item: ExecutiveActivityItemModel;
  title: string;
};

export const ActivityItem = memo(function ActivityItem({ item, title }: ActivityItemProps) {
  const Icon = TONE_ICONS[item.tone];

  return (
    <li className="flex gap-3 rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:bg-muted/20">
      <div
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
          item.tone === "success" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
          item.tone === "warning" && "border-amber-500/30 bg-amber-500/10 text-amber-500",
          item.tone === "error" && "border-rose-500/30 bg-rose-500/10 text-rose-500",
          item.tone === "info" && "border-border bg-muted/40 text-primary",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {item.module}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
        <time className="mt-2 block text-[11px] text-muted-foreground" dateTime={item.timestamp}>
          {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
        </time>
      </div>
    </li>
  );
});

type ActivityFeedProps = {
  items: ExecutiveActivityItemModel[];
  title: string;
  emptyLabel: string;
  loading?: boolean;
  refreshLabel: string;
  openIntegrationsLabel: string;
  isRefreshing?: boolean;
  onRefresh: () => void;
  onOpenIntegrations: () => void;
  resolveTitle: (item: ExecutiveActivityItemModel) => string;
};

export const ActivityFeed = memo(function ActivityFeed({
  items,
  title,
  emptyLabel,
  loading,
  refreshLabel,
  openIntegrationsLabel,
  isRefreshing,
  onRefresh,
  onOpenIntegrations,
  resolveTitle,
}: ActivityFeedProps) {
  return (
    <DashboardCard className="flex h-full flex-col p-5">
      <header className="mb-4 flex items-center gap-2">
        <Activity className="size-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">{title}</h3>
      </header>

      {loading ? (
        <div className="space-y-3" aria-hidden>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="max-h-[420px] space-y-2 overflow-y-auto pe-1" aria-live="polite">
          {items.map((item) => (
            <ActivityItem key={item.id} item={item} title={resolveTitle(item)} />
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isRefreshing}
          onClick={onRefresh}
        >
          <RefreshCw className={cn("me-1.5 size-3.5", isRefreshing && "animate-spin")} aria-hidden />
          {refreshLabel}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onOpenIntegrations}>
          <Plug className="me-1.5 size-3.5" aria-hidden />
          {openIntegrationsLabel}
        </Button>
      </div>
    </DashboardCard>
  );
});
