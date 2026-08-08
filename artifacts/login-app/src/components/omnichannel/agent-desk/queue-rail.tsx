import { memo, useCallback } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Inbox,
  User,
  UserX,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OmnichannelQueueFilter, OmnichannelQueueId } from "@/lib/omnichannel/services/conversation-queues";

const QUEUE_ICONS: Record<OmnichannelQueueFilter, typeof Inbox> = {
  all: Inbox,
  unassigned: UserX,
  mine: User,
  escalated: AlertTriangle,
  waiting_customer: Clock,
  waiting_ai: Bot,
  resolved: CheckCircle2,
  closed: Archive,
};

const QUEUE_ORDER: OmnichannelQueueFilter[] = [
  "all",
  "mine",
  "unassigned",
  "escalated",
  "waiting_customer",
  "waiting_ai",
  "resolved",
  "closed",
];

type QueueRailProps = {
  activeQueue: OmnichannelQueueFilter;
  onQueueChange: (queue: OmnichannelQueueFilter) => void;
  onOpenQueuePanel: () => void;
  queueOpen: boolean;
  counts: Record<OmnichannelQueueId, number> & { all: number };
  labels: Record<OmnichannelQueueFilter, string>;
  ariaLabels: {
    navigation: string;
    openList: string;
  };
};

export const QueueRail = memo(function QueueRail({
  activeQueue,
  onQueueChange,
  onOpenQueuePanel,
  queueOpen,
  counts,
  labels,
  ariaLabels,
}: QueueRailProps) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = QUEUE_ORDER[Math.min(QUEUE_ORDER.length - 1, index + 1)];
        if (next) onQueueChange(next);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prev = QUEUE_ORDER[Math.max(0, index - 1)];
        if (prev) onQueueChange(prev);
      }
    },
    [onQueueChange],
  );

  return (
    <nav
      className="flex w-[var(--ad-rail-width)] shrink-0 flex-col border-e border-[var(--ad-border)] bg-[var(--ad-surface)] py-2"
      aria-label={ariaLabels.navigation}
      role="tablist"
      aria-orientation="vertical"
    >
      <button
        type="button"
        onClick={onOpenQueuePanel}
        aria-expanded={queueOpen}
        aria-label={ariaLabels.openList}
        className={cn(
          "mx-2 mb-2 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition-colors",
          queueOpen
            ? "border-[var(--ad-accent)] bg-[var(--ad-accent-dim)] text-[var(--ad-accent)]"
            : "border-[var(--ad-border-subtle)] text-[var(--ad-text-muted)] hover:bg-[var(--ad-surface-raised)]",
        )}
      >
        <Inbox className="size-3.5 shrink-0" />
        <span className="truncate">{labels.all}</span>
        <span className="ms-auto tabular-nums">{counts.all}</span>
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
        {QUEUE_ORDER.filter((id) => id !== "all").map((queueId, index) => {
          const Icon = QUEUE_ICONS[queueId];
          const count = counts[queueId as OmnichannelQueueId];
          const active = activeQueue === queueId;
          return (
            <button
              key={queueId}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={labels[queueId]}
              onClick={() => onQueueChange(queueId)}
              onKeyDown={(event) => handleKeyDown(event, index + 1)}
              className={cn(
                "mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[11px] transition-colors duration-[var(--ad-dur-hover)]",
                active
                  ? "bg-[var(--ad-accent-dim)] text-[var(--ad-accent)] ring-1 ring-[var(--ad-accent)]/30"
                  : "text-[var(--ad-text-muted)] hover:bg-[var(--ad-surface-raised)] hover:text-[var(--ad-text)]",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate leading-tight">{labels[queueId]}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums",
                    active ? "bg-[var(--ad-accent)] text-primary-foreground" : "bg-[var(--ad-surface-raised)]",
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
});
