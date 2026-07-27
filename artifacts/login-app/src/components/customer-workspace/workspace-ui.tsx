import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CustomerHealth } from "@/lib/customer-workspace/customer-workspace-utils";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function WorkspacePanel({
  title,
  subtitle,
  action,
  children,
  className,
  dense,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border border-border/70 bg-card/85 shadow-sm", dense ? "p-4" : "p-5 lg:p-6", className)}>
      <div className={cn("flex items-start justify-between gap-3", dense ? "mb-3" : "mb-4")}>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function WorkspaceHealthCard({
  health,
  customerName,
  subtitle,
  className,
}: {
  health: CustomerHealth;
  customerName: string;
  subtitle: string;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const toneRing = {
    success: "ring-success/30",
    warning: "ring-warning/30",
    destructive: "ring-destructive/30",
  };

  return (
    <div className={cn("rounded-xl border border-border/70 bg-card/85 p-4 ring-1", toneRing[health.tone], className)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {t("dashboard.customerWorkspace.health.title")}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{customerName}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-end shrink-0">
          <p className={cn("font-mono text-3xl font-bold tabular-nums", health.tone === "success" && "text-success", health.tone === "warning" && "text-warning", health.tone === "destructive" && "text-destructive")}>
            {health.score}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t(health.labelKey)}</p>
        </div>
      </div>
    </div>
  );
}

export function WorkspaceGuidedEmpty({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted/40">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" className="mt-4 h-8 text-xs" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}

export function WorkspaceEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ElementType;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted/40">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-semibold">{title}</p>
      <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function WorkspaceMetric({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  compact,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ElementType;
  accent?: "warning" | "success";
  compact?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card/85", compact ? "p-3" : "p-4")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        {Icon && (
          <div className="flex size-7 items-center justify-center rounded-md bg-muted/35">
            <Icon className="size-3.5 text-primary" />
          </div>
        )}
      </div>
      <p className={cn("mt-1 font-mono font-bold tabular-nums tracking-tight", compact ? "text-xl" : "text-2xl", accent === "warning" && "text-warning", accent === "success" && "text-success")}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function WorkspaceListRow({
  title,
  subtitle,
  badge,
  onClick,
  compact,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  onClick?: () => void;
  compact?: boolean;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/25 text-start",
        compact ? "px-3 py-2" : "px-3.5 py-2.5",
        onClick && "transition-colors hover:border-primary/25 hover:bg-primary/5",
      )}
    >
      <div className="min-w-0">
        <p className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>{title}</p>
        {subtitle && <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>}
      </div>
      {badge && (
        <span className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      )}
    </Wrapper>
  );
}

export function WorkspaceSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  );
}

export { WorkspacePanel as WorkspaceSection };
