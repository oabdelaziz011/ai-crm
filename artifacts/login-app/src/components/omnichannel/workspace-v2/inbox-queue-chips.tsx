import { memo } from "react";
import { cn } from "@/lib/utils";
import type { WorkspaceNavId } from "@/components/omnichannel/workspace-v2/workspace-nav";
import { WORKSPACE_NAV_ORDER } from "@/components/omnichannel/workspace-v2/workspace-nav";

type InboxQueueChipsProps = {
  activeNav: WorkspaceNavId;
  onNavChange: (nav: WorkspaceNavId) => void;
  counts: Record<WorkspaceNavId, number>;
  labels: Record<WorkspaceNavId, string>;
  navOrder?: readonly WorkspaceNavId[];
  ariaLabel: string;
};

const EMPHASIS: Partial<Record<WorkspaceNavId, "danger" | "warn">> = {
  escalated: "danger",
  waiting: "warn",
  ai: "warn",
};

export const InboxQueueChips = memo(function InboxQueueChips({
  activeNav,
  onNavChange,
  counts,
  labels,
  navOrder = WORKSPACE_NAV_ORDER,
  ariaLabel,
}: InboxQueueChipsProps) {
  return (
    <div
      className="ws-inbox-chips flex flex-wrap gap-1.5 px-3 pb-2"
      dir="ltr"
      role="toolbar"
      aria-label={ariaLabel}
    >
      {navOrder.map((navId) => {
        const active = activeNav === navId;
        const count = counts[navId] ?? 0;
        const emphasis = EMPHASIS[navId];
        return (
          <button
            key={navId}
            type="button"
            aria-pressed={active}
            onClick={() => onNavChange(navId)}
            className={cn(
              "ws-inbox-chip inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              active
                ? "border-[var(--ws-accent)] bg-[var(--ws-accent)] text-primary-foreground shadow-sm"
                : "border-[var(--ws-border)] bg-[var(--ws-surface)] text-[var(--ws-muted)] hover:border-[var(--ws-accent)]/40 hover:text-[var(--ws-text)]",
              !active && emphasis === "danger" && count > 0 && "border-destructive/30 text-destructive",
              !active && emphasis === "warn" && count > 0 && "border-amber-500/30 text-amber-700 dark:text-amber-400",
            )}
          >
            <span className="truncate">{labels[navId]}</span>
            <span
              className={cn(
                "ms-0.5 inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                active
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : emphasis === "danger" && count > 0
                    ? "bg-destructive/15 text-destructive"
                    : "bg-[var(--ws-surface-2)] text-[var(--ws-muted)]",
              )}
              aria-hidden={count === 0 ? true : undefined}
            >
              {count > 999 ? "999+" : count}
            </span>
          </button>
        );
      })}
    </div>
  );
});
