import { memo } from "react";
import {
  AlertTriangle,
  Archive,
  Bot,
  Clock,
  Inbox,
  User,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKSPACE_NAV_ORDER, type WorkspaceNavId } from "@/components/omnichannel/workspace-v2/workspace-nav";

const NAV_ICONS: Record<WorkspaceNavId, typeof Inbox> = {
  inbox: Inbox,
  mine: User,
  assigned: UserCheck,
  escalated: AlertTriangle,
  waiting: Clock,
  closed: Archive,
  ai: Bot,
  archived: Archive,
};

type WorkspaceNavRailProps = {
  activeNav: WorkspaceNavId;
  onNavChange: (nav: WorkspaceNavId) => void;
  counts: Record<WorkspaceNavId, number>;
  labels: Record<WorkspaceNavId, string>;
  ariaLabel: string;
};

export const WorkspaceNavRail = memo(function WorkspaceNavRail({
  activeNav,
  onNavChange,
  counts,
  labels,
  ariaLabel,
}: WorkspaceNavRailProps) {
  return (
    <nav
      className="flex w-[var(--ws-nav-width)] shrink-0 flex-col items-center gap-0.5 border-e border-[var(--ws-border)] bg-[var(--ws-surface)] py-2"
      aria-label={ariaLabel}
    >
      {WORKSPACE_NAV_ORDER.map((navId) => {
        const Icon = NAV_ICONS[navId];
        const active = activeNav === navId;
        const count = counts[navId];
        return (
          <button
            key={navId}
            type="button"
            title={labels[navId]}
            aria-label={`${labels[navId]}${count > 0 ? ` (${count})` : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavChange(navId)}
            className={cn(
              "ws-nav-btn relative flex size-10 flex-col items-center justify-center rounded-lg text-[var(--ws-muted)]",
              active && "ws-nav-btn--active",
            )}
          >
            <Icon className="size-4" />
            {count > 0 ? (
              <span className="absolute -end-0.5 -top-0.5 flex min-w-[0.875rem] items-center justify-center rounded-full bg-[var(--ws-accent)] px-0.5 text-[7px] font-bold text-[#042f2e]">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
});
