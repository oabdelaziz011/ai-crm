import type { ReactNode } from "react";
import type { ElementType } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Shared ops-style frame: white surface, toolbar, no gray page wash. */
export function WorkspaceTabFrame({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-background",
        className,
      )}
    >
      {(title || subtitle || action) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-3 py-2.5">
          <div className="min-w-0">
            {title ? <p className="truncate text-sm font-semibold">{title}</p> : null}
            {subtitle ? <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-background">{children}</div>
    </div>
  );
}

export function WorkspaceInlineEmpty({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-border/60 bg-background">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button size="sm" className="mt-4 h-8 rounded-lg text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function WorkspaceStatusChip({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "success" | "warning" | "danger" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "success" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        tone === "warning" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "danger" && "bg-destructive/10 text-destructive",
        tone === "primary" && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </span>
  );
}
