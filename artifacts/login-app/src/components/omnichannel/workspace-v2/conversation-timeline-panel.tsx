import { memo, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { TimelineEvent } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import type { Profile } from "@/lib/types";
import {
  buildLifecycleTimelineCard,
  filterLifecycleTimelineEvents,
  groupLifecycleTimelineCards,
  searchLifecycleTimelineCards,
  type LifecycleTimelineActionLabels,
  type LifecycleTimelineDateLabels,
  type LifecycleTimelineFilterId,
} from "@/lib/omnichannel/presentation/lifecycle-timeline-presentation";
import type { SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";

export type ConversationTimelinePanelLabels = LifecycleTimelineActionLabels &
  LifecycleTimelineDateLabels & {
    filterAll: string;
    searchPlaceholder: string;
    empty: string;
    openAssignee: string;
    openCustomer360: string;
  };

type ConversationTimelinePanelProps = {
  events: TimelineEvent[];
  agentsById?: ReadonlyMap<string, { id: string; name: string }>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  smartTimeLabels: SmartTimeLabels;
  labels: ConversationTimelinePanelLabels;
  supportAgentFallback?: string;
  onNavigateToAssignee?: (userId: string) => void;
  onNavigateToAiEmployee?: (aiEmployeeId: string) => void;
  onOpenCustomer360?: () => void;
};

const FILTER_ORDER: LifecycleTimelineFilterId[] = [
  "all",
  "assignments",
  "escalations",
  "internal_notes",
  "ai",
  "status_changes",
];

function filterLabel(filter: LifecycleTimelineFilterId, labels: ConversationTimelinePanelLabels): string {
  switch (filter) {
    case "assignments":
      return labels.filterAssignments;
    case "escalations":
      return labels.filterEscalations;
    case "internal_notes":
      return labels.filterInternalNotes;
    case "ai":
      return labels.filterAi;
    case "status_changes":
      return labels.filterStatusChanges;
    default:
      return labels.filterAll;
  }
}

function badgeClass(tone: "default" | "accent" | "warn" | "danger" | "violet"): string {
  switch (tone) {
    case "accent":
      return "bg-[var(--ws-accent-dim)] text-[var(--ws-accent)]";
    case "warn":
      return "bg-[var(--ws-warn)]/15 text-[var(--ws-warn)]";
    case "danger":
      return "bg-[var(--ws-danger)]/15 text-[var(--ws-danger)]";
    case "violet":
      return "bg-primary/15 text-primary";
    default:
      return "bg-[var(--ws-surface-2)] text-[var(--ws-muted)]";
  }
}

export const ConversationTimelinePanel = memo(function ConversationTimelinePanel({
  events,
  agentsById,
  profilesByUserId,
  smartTimeLabels,
  labels,
  supportAgentFallback,
  onNavigateToAssignee,
  onNavigateToAiEmployee,
  onOpenCustomer360,
}: ConversationTimelinePanelProps) {
  const [filter, setFilter] = useState<LifecycleTimelineFilterId>("all");
  const [search, setSearch] = useState("");

  const cards = useMemo(() => {
    const filtered = filterLifecycleTimelineEvents(events, filter);
    return filtered.map((event) =>
      buildLifecycleTimelineCard(event, {
        agentsById,
        profilesByUserId,
        smartTimeLabels,
        actionLabels: labels,
        supportAgentFallback,
      }),
    );
  }, [agentsById, events, filter, labels, profilesByUserId, smartTimeLabels, supportAgentFallback]);

  const visibleCards = useMemo(() => searchLifecycleTimelineCards(cards, search), [cards, search]);

  const groups = useMemo(
    () =>
      groupLifecycleTimelineCards(visibleCards, {
        today: labels.today,
        yesterday: labels.yesterday,
        lastWeek: labels.lastWeek,
      }),
    [labels.lastWeek, labels.today, labels.yesterday, visibleCards],
  );

  if (events.length === 0) {
    return <p className="px-1 py-6 text-center text-[10px] text-[var(--ws-muted)]">{labels.empty}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          className="w-full rounded-md border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] py-1.5 ps-7 pe-2 text-[10px] text-[var(--ws-text)] placeholder:text-[var(--ws-muted)]"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTER_ORDER.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              filter === entry
                ? "bg-[var(--ws-accent-dim)] text-[var(--ws-accent)]"
                : "text-[var(--ws-muted)] hover:bg-[var(--ws-surface-2)]"
            }`}
            onClick={() => setFilter(entry)}
          >
            {filterLabel(entry, labels)}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="px-1 py-4 text-center text-[10px] text-[var(--ws-muted)]">{labels.empty}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.dateKey} className="space-y-2">
              <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ws-muted)]">
                {group.label}
              </h3>
              <ul className="space-y-2">
                {group.cards.map((card) => {
                  const clickableAssignee = Boolean(card.assigneeUserId && onNavigateToAssignee);
                  const clickableAi = Boolean(card.assigneeAiEmployeeId && onNavigateToAiEmployee);
                  const clickableCustomer = Boolean(card.opensCustomer360 && onOpenCustomer360);
                  const handleClick = () => {
                    if (clickableAssignee && card.assigneeUserId) {
                      onNavigateToAssignee?.(card.assigneeUserId);
                      return;
                    }
                    if (clickableAi && card.assigneeAiEmployeeId) {
                      onNavigateToAiEmployee?.(card.assigneeAiEmployeeId);
                      return;
                    }
                    if (clickableCustomer) {
                      onOpenCustomer360?.();
                    }
                  };
                  const isClickable = clickableAssignee || clickableAi || clickableCustomer;

                  return (
                    <li key={card.id}>
                      <button
                        type="button"
                        disabled={!isClickable}
                        onClick={isClickable ? handleClick : undefined}
                        className={`w-full rounded-lg border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] p-2.5 text-start transition-colors ${
                          isClickable ? "hover:border-[var(--ws-accent)]/40 hover:bg-[var(--ws-surface)]" : ""
                        }`}
                        title={
                          clickableAssignee
                            ? labels.openAssignee
                            : clickableCustomer
                              ? labels.openCustomer360
                              : undefined
                        }
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ws-accent-dim)] text-[10px] font-semibold text-[var(--ws-accent)]">
                              {card.actorInitials || "?"}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-semibold">{card.actorName}</p>
                              <p className="text-[10px] tabular-nums text-[var(--ws-muted)]" title={card.exactTime}>
                                {card.timeLabel} · {card.relativeTime}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badgeClass(card.badgeTone)}`}
                          >
                            {card.badgeLabel}
                          </span>
                        </div>

                        <p className="text-[11px] leading-relaxed text-[var(--ws-text)]">
                          {card.action}
                          {card.target ? (
                            <>
                              {" "}
                              <span className="font-medium text-[var(--ws-accent)]">{card.target}</span>
                            </>
                          ) : null}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
});
