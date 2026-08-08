import type { TFunction } from "i18next";
import type { LeadWorkspaceRow } from "@workspace/universal-operations-engine";
import type { KanbanCardModel } from "@/components/enterprise/kanban";
import {
  getCompanyCurrency,
  getCompanyIntlLocale,
} from "@/lib/company-locale/runtime";

export type LeadScoreTone = "cold" | "warm" | "hot" | "urgent";

export function resolveLeadScoreTone(lead: LeadWorkspaceRow): LeadScoreTone {
  if (lead.priority === "urgent") return "urgent";
  if (lead.temperature === "hot" || lead.temperature === "warm" || lead.temperature === "cold") {
    return lead.temperature;
  }
  return lead.scoreBand;
}

export function translateLeadScoreLabel(t: TFunction, tone: LeadScoreTone): string {
  return t(`leads.scoreBand.${tone}`);
}

/**
 * Format lead money using company billing currency (Settings → default_currency).
 * Reads the synced CompanyLocale runtime — never hardcodes SAR/USD.
 */
export function formatLeadMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const code = getCompanyCurrency();
  const locale = getCompanyIntlLocale();
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(
      Number(value),
    );
  } catch {
    return `${Number(value).toFixed(2)} ${code}`;
  }
}

export function formatRelativeActivity(
  t: TFunction,
  iso: string | null | undefined,
  locale?: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startTarget.getTime() - startToday.getTime()) / 86_400_000);

  if (diffDays === 0) return t("leads.kanban.relative.today");
  if (diffDays === 1) return t("leads.kanban.relative.tomorrow");
  if (diffDays === -1) return t("leads.kanban.relative.yesterday");
  if (diffDays > 1 && diffDays <= 7) {
    return t("leads.kanban.relative.inDays", { count: diffDays });
  }
  if (diffDays < -1 && diffDays >= -7) {
    return t("leads.kanban.relative.daysAgo", { count: Math.abs(diffDays) });
  }
  return date.toLocaleDateString(locale);
}

export function mapLeadToKanbanCard(
  t: TFunction,
  lead: LeadWorkspaceRow,
  locale?: string,
  aiEnabled = false,
): KanbanCardModel<LeadWorkspaceRow> {
  const tone = resolveLeadScoreTone(lead);
  const notesCount = lead.notes?.trim() ? 1 : 0;
  const tagsCount = lead.tags?.length ?? 0;

  return {
    id: lead.id,
    columnId: lead.stageId,
    title: lead.name || lead.contactPerson,
    subtitle: lead.companyName,
    valueLabel: formatLeadMoney(lead.expectedValue),
    scoreLabel: translateLeadScoreLabel(t, tone),
    scoreTone: tone,
    ownerLabel: lead.owner
      ? t("leads.kanban.card.owner", { name: lead.owner })
      : t("leads.kanban.card.ownerUnassigned"),
    nextActivityLabel: lead.expectedCloseDate
      ? t("leads.kanban.card.nextActivity", {
          when: formatRelativeActivity(t, lead.expectedCloseDate, locale) ?? lead.expectedCloseDate,
        })
      : null,
    lastActivityLabel: lead.lastActivityAt
      ? t("leads.kanban.card.lastActivity", {
          when: formatRelativeActivity(t, lead.lastActivityAt, locale) ?? lead.lastActivityAt,
        })
      : t("leads.kanban.card.lastActivityNone"),
    sourceLabel: lead.source
      ? t("leads.kanban.card.source", {
          source: (() => {
            const sourceKey = `leads.sources.${lead.source.toLowerCase().replace(/[\s-]+/g, "_")}`;
            const translated = t(sourceKey);
            return translated !== sourceKey ? translated : lead.source;
          })(),
        })
      : null,
    counters: [
      {
        id: "notes",
        label: t("leads.kanban.counters.notes"),
        count: notesCount,
      },
      {
        id: "tags",
        label: t("leads.kanban.counters.tags"),
        count: tagsCount,
      },
      {
        id: "tasks",
        label: t("leads.kanban.counters.tasks"),
        count: 0,
      },
      {
        id: "files",
        label: t("leads.kanban.counters.files"),
        count: 0,
      },
      {
        id: "meetings",
        label: t("leads.kanban.counters.meetings"),
        count: 0,
      },
      {
        id: "messages",
        label: t("leads.kanban.counters.messages"),
        count: lead.phone || lead.email ? 1 : 0,
      },
    ],
    winProbabilityLabel: aiEnabled
      ? t("leads.kanban.ai.winProbability", { percent: Math.min(95, Math.max(5, lead.score)) })
      : null,
    aiSummary: aiEnabled
      ? t("leads.kanban.ai.summaryFallback", { score: lead.score })
      : null,
    nextBestAction: aiEnabled ? t("leads.kanban.ai.nextBestAction") : null,
    suggestedFollowUp: aiEnabled ? t("leads.kanban.ai.suggestedFollowUp") : null,
    data: lead,
  };
}

export function leadMatchesSearch(lead: LeadWorkspaceRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    lead.name,
    lead.contactPerson,
    lead.companyName,
    lead.phone,
    lead.email,
    lead.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function leadMatchesFilters(
  lead: LeadWorkspaceRow,
  filters: {
    ownerId: string | null;
    sourceId: string | null;
    scoreBand: string | null;
    stageId: string | null;
    valueMin: string;
    valueMax: string;
    createdFrom: string;
    createdTo: string;
    lastActivityFrom: string;
    lastActivityTo: string;
    tag: string | null;
    country: string | null;
    city: string | null;
  },
  scoreTone: LeadScoreTone,
): boolean {
  if (filters.ownerId && lead.ownerId !== filters.ownerId) return false;
  if (filters.sourceId && lead.sourceId !== filters.sourceId) return false;
  if (filters.stageId && lead.stageId !== filters.stageId) return false;
  if (filters.scoreBand && scoreTone !== filters.scoreBand) return false;
  if (filters.tag && !lead.tags.includes(filters.tag)) return false;

  const value = lead.expectedValue ?? 0;
  if (filters.valueMin && value < Number(filters.valueMin)) return false;
  if (filters.valueMax && value > Number(filters.valueMax)) return false;

  if (filters.createdFrom && lead.createdAt < filters.createdFrom) return false;
  if (filters.createdTo && lead.createdAt > `${filters.createdTo}T23:59:59`) return false;
  if (filters.lastActivityFrom && (lead.lastActivityAt ?? "") < filters.lastActivityFrom) {
    return false;
  }
  if (
    filters.lastActivityTo &&
    (lead.lastActivityAt ?? "") > `${filters.lastActivityTo}T23:59:59`
  ) {
    return false;
  }

  void filters.city;
  void filters.country;
  return true;
}
