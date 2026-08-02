import { memo, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import {
  buildConversationHistoryCard,
  filterConversationHistoryEvents,
  formatHistoryEventDescription,
  groupConversationHistoryCards,
  searchConversationHistoryEvents,
} from "@/lib/omnichannel/presentation/conversation-history-presentation";
import { eventTypeLabel } from "@/lib/omnichannel/presentation/intelligence-view-model";
import type { ConversationHistoryFilterId } from "@/lib/omnichannel/presentation/conversation-intelligence-types";
import { useIntelligenceContext } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-context";
import { EnterpriseCard } from "@/components/omnichannel/workspace-v2/intelligence/enterprise-card";
import {
  avatarToneClass,
  historyBadgeClass,
  iconForEventKind,
} from "@/components/omnichannel/workspace-v2/intelligence/intelligence-shared";
import { TimelineRail } from "@/components/omnichannel/workspace-v2/intelligence/intelligence-ui";
import type { ConversationHistoryPanelLabels } from "@/components/omnichannel/workspace-v2/conversation-history-panel";

const FILTER_ORDER: ConversationHistoryFilterId[] = [
  "everything",
  "messages",
  "assignments",
  "escalations",
  "notes",
  "ai",
  "crm",
  "tickets",
  "workflow",
  "automation",
];

function filterLabel(filter: ConversationHistoryFilterId, labels: ConversationHistoryPanelLabels): string {
  const map: Record<ConversationHistoryFilterId, string> = {
    everything: labels.filterEverything,
    messages: labels.filterMessages,
    assignments: labels.filterAssignments,
    ai: labels.filterAi,
    crm: labels.filterCrm,
    invoices: labels.filterInvoices,
    bookings: labels.filterBookings,
    escalations: labels.filterEscalations,
    notes: labels.filterNotes,
    tickets: labels.filterTickets,
    workflow: labels.filterWorkflow,
    automation: labels.filterAutomation,
  };
  return map[filter];
}

function eventTimelineTone(kind: string): "healthy" | "warning" | "critical" | "resolved" | "closed" | "escalated" | "default" {
  if (kind.includes("escalation")) return "escalated";
  if (kind.includes("resolved")) return "resolved";
  if (kind.includes("closed")) return "closed";
  if (kind.includes("ticket")) return "warning";
  return "default";
}

export const IntelligenceHistoryTab = memo(function IntelligenceHistoryTab() {
  const {
    snapshot,
    panelLabels: labels,
    polishLabels,
    smartTimeLabels,
    dir,
    labels: sidebarLabels,
    onNavigateToAssignee,
    onNavigateToAiEmployee,
    onOpenCrmTab,
  } = useIntelligenceContext();

  const [filter, setFilter] = useState<ConversationHistoryFilterId>("everything");
  const [search, setSearch] = useState("");

  const searchContext = useMemo(() => {
    const agentNames = [
      ...new Set(
        snapshot.history
          .filter((event) => event.actorType === "agent" && event.actorLabel?.trim())
          .map((event) => event.actorLabel!.trim()),
      ),
    ];
    const customerEvent = snapshot.history.find((event) => event.actorType === "customer");
    return {
      customerName: customerEvent?.actorLabel ?? undefined,
      agentNames,
      aiSummary: snapshot.insight.summary,
    };
  }, [snapshot.history, snapshot.insight.summary]);

  const visibleEvents = useMemo(() => {
    const sorted = [...snapshot.history].sort(
      (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
    const filtered = filterConversationHistoryEvents(sorted, filter);
    return searchConversationHistoryEvents(filtered, search, searchContext);
  }, [filter, search, searchContext, snapshot.history]);

  const cards = useMemo(
    () => visibleEvents.map((event) => buildConversationHistoryCard(event, smartTimeLabels)),
    [smartTimeLabels, visibleEvents],
  );

  const groups = useMemo(() => {
    const grouped = groupConversationHistoryCards(cards, {
      today: labels.dateToday,
      yesterday: labels.dateYesterday,
      last7Days: polishLabels.dateLastWeek,
      last30Days: labels.dateLast30Days,
      older: labels.dateOlder,
    });

    return grouped.map((group) => ({
      ...group,
      cards: [...group.cards].sort(
        (left, right) =>
          new Date(right.event.timestamp).getTime() - new Date(left.event.timestamp).getTime(),
      ),
    }));
  }, [cards, labels, polishLabels.dateLastWeek]);

  const flatCards = useMemo(() => groups.flatMap((group) => group.cards), [groups]);

  return (
    <div className="space-y-3" dir={dir}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          className="ws-input w-full py-1.5 ps-7 pe-2 text-[10px]"
          dir={dir}
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

      {flatCards.length === 0 ? (
        <EnterpriseCard className="py-6 text-center text-[10px] text-[var(--ws-muted)]">{labels.empty}</EnterpriseCard>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.groupId} className="space-y-1">
              <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ws-muted)]">
                {group.label}
              </h4>
              <ul className="rounded-xl border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] px-2 py-2">
                {group.cards.map((card, index) => {
                  const Icon = iconForEventKind(card.event.kind);
                  const typeLabel = eventTypeLabel(card.event.kind, polishLabels);
                  const description = formatHistoryEventDescription(card.event);
                  const clickableAssignee = Boolean(card.event.assigneeUserId && onNavigateToAssignee);
                  const clickableAi = Boolean(card.event.assigneeAiEmployeeId && onNavigateToAiEmployee);
                  const clickableCustomer = Boolean(card.event.opensCustomer360 && onOpenCrmTab);
                  const isClickable = clickableAssignee || clickableAi || clickableCustomer;
                  const globalIndex = flatCards.findIndex((entry) => entry.id === card.id);

                  const handleOpen = () => {
                    if (clickableAssignee && card.event.assigneeUserId) {
                      onNavigateToAssignee?.(card.event.assigneeUserId);
                      return;
                    }
                    if (clickableAi && card.event.assigneeAiEmployeeId) {
                      onNavigateToAiEmployee?.(card.event.assigneeAiEmployeeId);
                      return;
                    }
                    if (clickableCustomer) onOpenCrmTab?.();
                  };

                  return (
                    <li
                      key={card.id}
                      className={`group flex gap-2 py-2 transition-colors hover:bg-[var(--ws-surface)]/60 ${
                        index < group.cards.length - 1 ? "border-b border-[var(--ws-border-subtle)]" : ""
                      }`}
                    >
                      <TimelineRail
                        isFirst={globalIndex === 0}
                        isLast={globalIndex === flatCards.length - 1}
                        tone={eventTimelineTone(card.event.kind)}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start gap-2">
                          <div
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${avatarToneClass(card.event.actorType)}`}
                          >
                            {card.actorInitials || "•"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold">{card.actorName}</p>
                                <span
                                  className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-medium ${historyBadgeClass(card.event.badgeTone)}`}
                                >
                                  <Icon className="size-2.5 shrink-0" />
                                  {typeLabel}
                                </span>
                              </div>
                              <time
                                className="shrink-0 text-[9px] tabular-nums text-[var(--ws-muted)]"
                                title={card.exactTime}
                                dateTime={card.event.timestamp}
                              >
                                {card.relativeTime}
                              </time>
                            </div>
                            <p className="mt-1 whitespace-pre-line text-[10px] leading-relaxed text-[var(--ws-text)]" dir="auto">
                              {description}
                            </p>
                          </div>
                        </div>

                        {isClickable ? (
                          <button
                            type="button"
                            className="ws-btn ws-btn--ghost ms-9 flex items-center gap-1 px-2 py-0.5 text-[9px] opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={handleOpen}
                          >
                            <ExternalLink className="size-3" />
                            {clickableAssignee
                              ? labels.openAssignee
                              : clickableCustomer
                                ? sidebarLabels.tabs.crm
                                : labels.viewEvent}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
