import { memo, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Calendar,
  Check,
  ExternalLink,
  Layers,
  Link2,
  MessageSquare,
  Play,
  Receipt,
  RefreshCw,
  Search,
  Shuffle,
  Sparkles,
  StickyNote,
  Ticket,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type {
  OmnichannelAiAssistModel,
  OmnichannelCustomerContext,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";
import type { Profile } from "@/lib/types";
import type { SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";
import {
  buildConversationHistoryCard,
  filterConversationHistoryEvents,
  groupConversationHistoryCards,
  searchConversationHistoryEvents,
} from "@/lib/omnichannel/presentation/conversation-history-presentation";
import {
  buildConversationIntelligenceSnapshot,
  type ConversationInsightLabels,
} from "@/lib/omnichannel/presentation/conversation-insight-provider";
import type {
  ConversationHistoryFilterId,
  ConversationHistoryIconKey,
  ConversationHistoryEvent,
} from "@/lib/omnichannel/presentation/conversation-intelligence-types";
import type { ConversationHistoryLabels } from "@/lib/omnichannel/presentation/conversation-history-builder";

export type ConversationHistoryPanelLabels = ConversationHistoryLabels &
  ConversationInsightLabels & {
    title: string;
    aiAnalysisTitle: string;
    customerMood: string;
    whyTitle: string;
    recommendedAction: string;
    healthTitle: string;
    healthStatus: string;
    healthSla: string;
    healthAvgResponse: string;
    healthAgentMessages: string;
    healthCustomerMessages: string;
    healthInternalNotes: string;
    healthEscalations: string;
    healthTransfers: string;
    healthAiResponses: string;
    healthHumanResponses: string;
    journeyTitle: string;
    summaryTitle: string;
    confidence: string;
    searchPlaceholder: string;
    empty: string;
    openAssignee: string;
    openCustomer360: string;
    filterEverything: string;
    filterMessages: string;
    filterAssignments: string;
    filterAi: string;
    filterCrm: string;
    filterInvoices: string;
    filterBookings: string;
    filterEscalations: string;
    filterNotes: string;
    filterTickets: string;
    filterWorkflow: string;
    filterAutomation: string;
    dateToday: string;
    dateYesterday: string;
    dateLast7Days: string;
    dateLast30Days: string;
    dateOlder: string;
    minutesShort: string;
    viewEvent: string;
  };

type ConversationHistoryPanelProps = {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  lifecycleSnapshot?: LifecycleSnapshot | null;
  customerContext?: OmnichannelCustomerContext | null;
  aiAssist: OmnichannelAiAssistModel;
  agentsById?: ReadonlyMap<string, { id: string; name: string }>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  smartTimeLabels: SmartTimeLabels;
  labels: ConversationHistoryPanelLabels;
  supportAgentFallback?: string;
  slaLabels?: {
    remainingMinutes: (count: number) => string;
    remainingHours: (count: number) => string;
    breached: string;
    notSet: string;
  };
  onNavigateToAssignee?: (userId: string) => void;
  onNavigateToAiEmployee?: (aiEmployeeId: string) => void;
  onOpenCustomer360?: () => void;
  onFocusEvent?: (eventId: string) => void;
};

const FILTER_ORDER: ConversationHistoryFilterId[] = [
  "everything",
  "messages",
  "assignments",
  "ai",
  "crm",
  "invoices",
  "bookings",
  "escalations",
  "notes",
  "tickets",
];

const ICONS: Record<ConversationHistoryIconKey, typeof MessageSquare> = {
  play: Play,
  message: MessageSquare,
  bot: Bot,
  user: User,
  users: Users,
  layers: Layers,
  alert: AlertTriangle,
  sticky: StickyNote,
  link: Link2,
  "user-plus": UserPlus,
  calendar: Calendar,
  receipt: Receipt,
  ticket: Ticket,
  sparkles: Sparkles,
  refresh: RefreshCw,
  check: Check,
  x: X,
  "arrow-up": ArrowUpRight,
  shuffle: Shuffle,
  workflow: Sparkles,
  automation: Bot,
};

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

function badgeClass(tone: ConversationHistoryEvent["badgeTone"]): string {
  switch (tone) {
    case "accent":
      return "bg-[var(--ws-accent-dim)] text-[var(--ws-accent)]";
    case "warn":
      return "bg-[var(--ws-warn)]/15 text-[var(--ws-warn)]";
    case "danger":
      return "bg-[var(--ws-danger)]/15 text-[var(--ws-danger)]";
    case "violet":
      return "bg-violet-500/15 text-[var(--ws-violet)]";
    case "success":
      return "bg-emerald-500/15 text-emerald-400";
    default:
      return "bg-[var(--ws-surface-2)] text-[var(--ws-muted)]";
  }
}

function healthStatusClass(status: "healthy" | "warning" | "critical"): string {
  if (status === "healthy") return "text-emerald-400";
  if (status === "warning") return "text-[var(--ws-warn)]";
  return "text-[var(--ws-danger)]";
}

export const ConversationHistoryPanel = memo(function ConversationHistoryPanel({
  conversation,
  messages,
  lifecycleSnapshot,
  customerContext,
  aiAssist,
  agentsById,
  profilesByUserId,
  smartTimeLabels,
  labels,
  supportAgentFallback,
  slaLabels,
  onNavigateToAssignee,
  onNavigateToAiEmployee,
  onOpenCustomer360,
  onFocusEvent,
}: ConversationHistoryPanelProps) {
  const [filter, setFilter] = useState<ConversationHistoryFilterId>("everything");
  const [search, setSearch] = useState("");

  const snapshot = useMemo(
    () =>
      buildConversationIntelligenceSnapshot({
        conversation,
        messages,
        lifecycleSnapshot,
        customerContext,
        aiAssist,
        agentsById,
        profilesByUserId,
        labels,
        smartTimeLabels,
        supportAgentFallback,
        slaLabels,
      }),
    [
      agentsById,
      aiAssist,
      conversation,
      customerContext,
      labels,
      lifecycleSnapshot,
      messages,
      profilesByUserId,
      slaLabels,
      smartTimeLabels,
      supportAgentFallback,
    ],
  );

  const { insight, health, history, journey } = snapshot;
  const dir = insight.direction;

  const visibleEvents = useMemo(() => {
    const filtered = filterConversationHistoryEvents(history, filter);
    return searchConversationHistoryEvents(filtered, search, { aiSummary: insight.summary });
  }, [filter, history, insight.summary, search]);

  const cards = useMemo(
    () => visibleEvents.map((event) => buildConversationHistoryCard(event, smartTimeLabels)),
    [smartTimeLabels, visibleEvents],
  );

  const groups = useMemo(
    () =>
      groupConversationHistoryCards(cards, {
        today: labels.dateToday,
        yesterday: labels.dateYesterday,
        last7Days: labels.dateLast7Days,
        last30Days: labels.dateLast30Days,
        older: labels.dateOlder,
      }),
    [cards, labels.dateLast30Days, labels.dateLast7Days, labels.dateOlder, labels.dateToday, labels.dateYesterday],
  );

  const healthStatusLabel =
    health.status === "healthy"
      ? labels.healthHealthy
      : health.status === "warning"
        ? labels.healthWarning
        : labels.healthCritical;

  return (
    <div className="space-y-4" dir={dir}>
      <section className="rounded-lg border border-violet-500/15 bg-violet-950/15 p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ws-violet)]">
          <Sparkles className="size-3.5" />
          {labels.aiAnalysisTitle}
        </h3>

        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ws-muted)]">
          {labels.customerMood}
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {insight.moods.map((mood) => (
            <span
              key={mood.id}
              className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium text-violet-200"
            >
              {mood.label}{" "}
              <span className="text-[var(--ws-muted)]">
                {labels.confidence.replace("{{percent}}", String(mood.confidence))}
              </span>
            </span>
          ))}
        </div>

        {insight.explanations.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1 text-[10px] font-medium text-[var(--ws-muted)]">{labels.whyTitle}</p>
            <ul className="space-y-1">
              {insight.explanations.map((reason) => (
                <li key={reason} className="text-[10px] leading-relaxed text-[var(--ws-text)]" dir="auto">
                  • {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {insight.recommendations.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1 text-[10px] font-medium text-[var(--ws-muted)]">{labels.recommendedAction}</p>
            <ul className="space-y-1.5">
              {insight.recommendations.map((rec) => (
                <li
                  key={rec.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] px-2 py-1.5 text-[10px]"
                >
                  <span dir="auto">{rec.action}</span>
                  <span className="shrink-0 tabular-nums text-[var(--ws-muted)]">
                    {labels.confidence.replace("{{percent}}", String(rec.confidence))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="rounded-md border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] p-2">
          <p className="mb-1 text-[10px] font-medium text-[var(--ws-muted)]">{labels.summaryTitle}</p>
          <p className="text-[11px] leading-relaxed text-[var(--ws-text)]" dir="auto">
            {insight.summary}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] p-3">
        <h3 className="mb-2 text-[11px] font-semibold">{labels.healthTitle}</h3>
        <div className="mb-2 flex items-center justify-between gap-2 text-[10px]">
          <span className="text-[var(--ws-muted)]">{labels.healthStatus}</span>
          <span className={`font-semibold ${healthStatusClass(health.status)}`}>{healthStatusLabel}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
          <Metric label={labels.healthSla} value={health.slaLabel} />
          <Metric
            label={labels.healthAvgResponse}
            value={
              health.averageResponseTimeMinutes != null
                ? `${health.averageResponseTimeMinutes}${labels.minutesShort}`
                : "—"
            }
          />
          <Metric label={labels.healthAgentMessages} value={String(health.agentMessages)} />
          <Metric label={labels.healthCustomerMessages} value={String(health.customerMessages)} />
          <Metric label={labels.healthInternalNotes} value={String(health.internalNotes)} />
          <Metric label={labels.healthEscalations} value={String(health.escalations)} />
          <Metric label={labels.healthTransfers} value={String(health.transfers)} />
          <Metric label={labels.healthAiResponses} value={String(health.aiResponses)} />
          <Metric label={labels.healthHumanResponses} value={String(health.humanResponses)} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 px-1 text-[11px] font-semibold">{labels.title}</h3>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ws-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.searchPlaceholder}
            className="w-full rounded-md border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] py-1.5 ps-7 pe-2 text-[10px] text-[var(--ws-text)] placeholder:text-[var(--ws-muted)]"
            dir={dir}
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-1">
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
              <div key={group.groupId} className="space-y-2">
                <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ws-muted)]">
                  {group.label}
                </h4>
                <ul className="space-y-2">
                  {group.cards.map((card) => {
                    const Icon = ICONS[card.event.iconKey] ?? MessageSquare;
                    const clickableAssignee = Boolean(card.event.assigneeUserId && onNavigateToAssignee);
                    const clickableAi = Boolean(card.event.assigneeAiEmployeeId && onNavigateToAiEmployee);
                    const clickableCustomer = Boolean(card.event.opensCustomer360 && onOpenCustomer360);
                    const isClickable = clickableAssignee || clickableAi || clickableCustomer;

                    const handleOpen = () => {
                      if (clickableAssignee && card.event.assigneeUserId) {
                        onNavigateToAssignee?.(card.event.assigneeUserId);
                        return;
                      }
                      if (clickableAi && card.event.assigneeAiEmployeeId) {
                        onNavigateToAiEmployee?.(card.event.assigneeAiEmployeeId);
                        return;
                      }
                      if (clickableCustomer) onOpenCustomer360?.();
                      onFocusEvent?.(card.event.id);
                    };

                    return (
                      <li key={card.id} className="group">
                        <div
                          className={`rounded-lg border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] p-2.5 transition-colors ${
                            isClickable ? "hover:border-[var(--ws-accent)]/40 hover:bg-[var(--ws-surface)]" : ""
                          }`}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ws-accent-dim)] text-[var(--ws-accent)]">
                                <Icon className="size-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold">{card.actorName}</p>
                                <p
                                  className="text-[10px] tabular-nums text-[var(--ws-muted)]"
                                  title={card.exactTime}
                                >
                                  {card.timeLabel} · {card.relativeTime}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badgeClass(card.event.badgeTone)}`}
                            >
                              {card.event.badgeLabel}
                            </span>
                          </div>

                          <p className="text-[11px] leading-relaxed text-[var(--ws-text)]" dir="auto">
                            {card.event.action}
                            {card.event.target ? (
                              <>
                                {" "}
                                <span className="font-medium text-[var(--ws-accent)]">{card.event.target}</span>
                              </>
                            ) : null}
                          </p>

                          {isClickable ? (
                            <div className="mt-2 flex justify-end opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                className="ws-btn ws-btn--ghost flex items-center gap-1 px-2 py-1 text-[10px]"
                                onClick={handleOpen}
                              >
                                <ExternalLink className="size-3" />
                                {clickableAssignee
                                  ? labels.openAssignee
                                  : clickableCustomer
                                    ? labels.openCustomer360
                                    : labels.viewEvent}
                              </button>
                            </div>
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
      </section>

      {journey.length > 0 ? (
        <section className="rounded-lg border border-[var(--ws-border-subtle)] bg-[var(--ws-surface-2)] p-3">
          <h3 className="mb-3 text-[11px] font-semibold">{labels.journeyTitle}</h3>
          <ol className="space-y-0">
            {journey.map((step, index) => (
              <li key={step.id} className="relative flex gap-2 pb-3 last:pb-0">
                {index < journey.length - 1 ? (
                  <span className="absolute start-[7px] top-4 h-[calc(100%-8px)] w-px bg-[var(--ws-border)]" />
                ) : null}
                <span className="relative z-[1] mt-1 size-3.5 shrink-0 rounded-full border-2 border-[var(--ws-accent)] bg-[var(--ws-surface)]" />
                <div className="min-w-0 flex-1">
                  {step.clickable ? (
                    <button
                      type="button"
                      className="text-start text-[10px] font-medium text-[var(--ws-accent)] hover:underline"
                      onClick={() => onFocusEvent?.(step.eventId)}
                      dir="auto"
                    >
                      {step.label}
                    </button>
                  ) : (
                    <p className="text-[10px] font-medium" dir="auto">
                      {step.label}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-[var(--ws-muted)]" dir="auto">
        {label}
      </span>
      <span className="font-medium tabular-nums" dir="auto">
        {value}
      </span>
    </div>
  );
}
