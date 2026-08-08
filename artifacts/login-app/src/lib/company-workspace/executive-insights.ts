export type ExecutiveInsightTone = "info" | "warning" | "danger" | "success";

export type ExecutiveInsightAction =
  | { type: "route"; href: string }
  | { type: "companyTab"; tab: string };

export type ExecutiveInsight = {
  id: string;
  tone: ExecutiveInsightTone;
  /** i18n key under companyWorkspace.overview.insights.items.* */
  messageKey: string;
  params?: Record<string, string | number>;
  /** Required for production gate — insight must open a real destination. */
  action: ExecutiveInsightAction;
};

export type InsightCapabilities = {
  canAiCosts: boolean;
  canSubscription: boolean;
  canBilling: boolean;
  canManageEmployees: boolean;
  canKnowledge: boolean;
  canInvoices: boolean;
  canChannels: boolean;
};

/**
 * Derive CEO insights only from measured signals.
 * Insights without a permitted destination are omitted.
 */
export function buildExecutiveInsights(
  input: {
    aiTokensUsed: number | null;
    aiTokensPreviousWindow: number | null;
    storageUsedGb: number | null;
    storageLimitGb: number | null;
    renewalAt: string | null;
    employeesCount: number;
    seatsLimit: number | null;
    knowledgeDocs: number | null;
    openInvoices: number | null;
    connectedChannels: number | null;
    aiQuotaPct: number | null;
    now?: Date;
  },
  caps: InsightCapabilities,
): ExecutiveInsight[] {
  const now = input.now ?? new Date();
  const insights: ExecutiveInsight[] = [];

  if (
    caps.canAiCosts &&
    input.aiTokensUsed != null &&
    input.aiTokensPreviousWindow != null &&
    input.aiTokensPreviousWindow > 0
  ) {
    const delta =
      ((input.aiTokensUsed - input.aiTokensPreviousWindow) /
        input.aiTokensPreviousWindow) *
      100;
    if (Math.abs(delta) >= 10) {
      insights.push({
        id: "ai-usage-change",
        tone: delta > 0 ? "warning" : "success",
        messageKey: delta > 0 ? "aiUsageUp" : "aiUsageDown",
        params: { pct: Math.round(Math.abs(delta)) },
        action: { type: "route", href: "/dashboard/ai-usage" },
      });
    }
  }

  if (
    (caps.canSubscription || caps.canBilling) &&
    input.storageUsedGb != null &&
    input.storageLimitGb != null &&
    input.storageLimitGb > 0
  ) {
    const pct = (input.storageUsedGb / input.storageLimitGb) * 100;
    if (pct >= 90) {
      insights.push({
        id: "storage-full",
        tone: "danger",
        messageKey: "storageAlmostFull",
        params: { pct: Math.round(pct) },
        action: caps.canSubscription
          ? { type: "companyTab", tab: "subscription" }
          : { type: "route", href: "/dashboard/workspace/billing" },
      });
    } else if (pct >= 75) {
      insights.push({
        id: "storage-high",
        tone: "warning",
        messageKey: "storageHigh",
        params: { pct: Math.round(pct) },
        action: caps.canSubscription
          ? { type: "companyTab", tab: "subscription" }
          : { type: "route", href: "/dashboard/workspace/billing" },
      });
    }
  }

  if ((caps.canSubscription || caps.canBilling) && input.renewalAt) {
    const renewal = new Date(input.renewalAt);
    if (!Number.isNaN(renewal.getTime())) {
      const days = Math.ceil((renewal.getTime() - now.getTime()) / 86_400_000);
      if (days >= 0 && days <= 30) {
        insights.push({
          id: "renewal-soon",
          tone: days <= 7 ? "danger" : "warning",
          messageKey: "renewalSoon",
          params: { days },
          action: caps.canBilling
            ? { type: "route", href: "/dashboard/workspace/billing" }
            : { type: "companyTab", tab: "subscription" },
        });
      }
    }
  }

  if (
    caps.canManageEmployees &&
    input.seatsLimit != null &&
    input.seatsLimit > 0 &&
    input.employeesCount >= input.seatsLimit
  ) {
    insights.push({
      id: "seats-full",
      tone: "danger",
      messageKey: "seatsAtLimit",
      params: { used: input.employeesCount, limit: input.seatsLimit },
      action: { type: "companyTab", tab: "employees" },
    });
  } else if (
    caps.canManageEmployees &&
    input.seatsLimit != null &&
    input.seatsLimit > 0 &&
    input.employeesCount / input.seatsLimit >= 0.9
  ) {
    insights.push({
      id: "seats-near",
      tone: "warning",
      messageKey: "seatsNearLimit",
      params: { used: input.employeesCount, limit: input.seatsLimit },
      action: { type: "companyTab", tab: "employees" },
    });
  }

  if (caps.canKnowledge && input.knowledgeDocs === 0) {
    insights.push({
      id: "knowledge-inactive",
      tone: "info",
      messageKey: "knowledgeInactive",
      action: { type: "route", href: "/dashboard/knowledge" },
    });
  }

  if (caps.canInvoices && input.openInvoices != null && input.openInvoices > 0) {
    insights.push({
      id: "open-invoices",
      tone: "warning",
      messageKey: "openInvoices",
      params: { count: input.openInvoices },
      action: { type: "route", href: "/dashboard/invoices" },
    });
  }

  if (caps.canChannels && input.connectedChannels === 0) {
    insights.push({
      id: "no-channels",
      tone: "info",
      messageKey: "noChannels",
      action: { type: "route", href: "/dashboard/channels" },
    });
  }

  if (caps.canAiCosts && input.aiQuotaPct != null && input.aiQuotaPct >= 85) {
    insights.push({
      id: "ai-quota",
      tone: input.aiQuotaPct >= 100 ? "danger" : "warning",
      messageKey: input.aiQuotaPct >= 100 ? "aiQuotaExceeded" : "aiQuotaHigh",
      params: { pct: Math.round(input.aiQuotaPct) },
      action: { type: "route", href: "/dashboard/ai-usage" },
    });
  }

  return insights.slice(0, 6);
}

/** Compare last 15 days vs prior 15 days token totals from a 30-day series. */
export function splitWindowTokenTotals(
  series: Array<{ tokens: number }>,
): { recent: number | null; previous: number | null } {
  if (series.length < 30) return { recent: null, previous: null };
  const previous = series.slice(0, 15).reduce((s, d) => s + d.tokens, 0);
  const recent = series.slice(15).reduce((s, d) => s + d.tokens, 0);
  if (previous <= 0 && recent <= 0) return { recent: null, previous: null };
  return { recent, previous };
}
