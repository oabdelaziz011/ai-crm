import { getCompanyCurrency } from "@/lib/company-locale/runtime";

export type DailyUsagePoint = {
  dateKey: string;
  label: string;
  tokens: number;
  cost: number;
  requests: number;
};

export type NamedUsage = {
  key: string;
  label: string;
  tokens: number;
  requests: number;
  cost?: number;
  usagePct?: number;
  costPct?: number;
};

/**
 * Hero quota bar tones:
 * ok = green 0–60, mid = blue 60–80, warn = orange 80–95,
 * high = red 95–100, over = dark red >100
 */
export type AiQuotaTone = "ok" | "mid" | "warn" | "high" | "over";

export type AiQuotaWarningLevel = "yellow" | "red" | "over" | null;

export type ExecutiveAiUsageMetrics = {
  provider: string | null;
  model: string | null;
  monthlyQuota: number | null;
  used: number;
  remaining: number | null;
  quotaPct: number | null;
  /** Uncapped pct for over-quota display (may exceed 100). */
  quotaPctRaw: number | null;
  remainingPct: number | null;
  tone: AiQuotaTone | null;
  warningLevel: AiQuotaWarningLevel;
  costThisMonth: number;
  costToday: number | null;
  currency: string;
  estimatedMonthEndCost: number | null;
  estimatedMonthEndUsage: number | null;
  estimatedFinishDays: number | null;
  estimatedFinishDate: string | null;
  averageDailyTokens: number | null;
  averageTokensPerRequest: number | null;
  tokensToday: number | null;
  tokensYesterday: number | null;
  average7DayTokens: number | null;
  average30DayTokens: number | null;
  requestsToday: number | null;
  requestsThisMonth: number;
  averageLatencyMs: number | null;
  successPct: number | null;
  errorPct: number | null;
  failures: number | null;
  retries: number | null;
  overageTokens: number | null;
  estimatedExtraCost: number | null;
  dailySeries: DailyUsagePoint[];
  topModels: NamedUsage[];
  topFeatures: NamedUsage[];
  hasUsage: boolean;
};

type CostRecordLike = {
  provider_key?: string | null;
  model?: string | null;
  total_tokens?: number | null;
  estimated_cost?: number | null;
  recorded_at?: string | null;
};

type AnalyticsRecordLike = {
  template_key?: string | null;
  model?: string | null;
  total_tokens?: number | null;
  recorded_at?: string | null;
  provider_key?: string | null;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey.slice(5);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function shiftDayKey(dateKey: string, delta: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function meanTokens(points: DailyUsagePoint[]): number | null {
  if (!points.length) return null;
  const sum = points.reduce((s, p) => s + p.tokens, 0);
  return Math.round(sum / points.length);
}

export function quotaTone(pctRaw: number | null, overQuota: boolean): AiQuotaTone | null {
  if (overQuota) return "over";
  if (pctRaw == null) return null;
  if (pctRaw >= 95) return "high";
  if (pctRaw >= 80) return "warn";
  if (pctRaw >= 60) return "mid";
  return "ok";
}

export function deriveQuotaWarningLevel(
  remainingPct: number | null,
  overQuota: boolean,
): AiQuotaWarningLevel {
  if (overQuota) return "over";
  if (remainingPct == null) return null;
  if (remainingPct < 10) return "red";
  if (remainingPct < 20) return "yellow";
  return null;
}

export function buildDailyUsageSeries(
  records: CostRecordLike[],
  days = 30,
  now = new Date(),
): DailyUsagePoint[] {
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  const map = new Map<string, DailyUsagePoint>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { dateKey: key, label: dayLabel(key), tokens: 0, cost: 0, requests: 0 });
  }

  let hit = false;
  for (const record of records) {
    if (!record.recorded_at) continue;
    const key = dayKey(record.recorded_at);
    const bucket = map.get(key);
    if (!bucket) continue;
    hit = true;
    bucket.tokens += Number(record.total_tokens ?? 0);
    bucket.cost += Number(record.estimated_cost ?? 0);
    bucket.requests += 1;
  }

  return hit ? Array.from(map.values()) : [];
}

export function deriveSuccessErrorPct(
  byStatus: Record<string, number> | null | undefined,
): { successPct: number | null; errorPct: number | null; failures: number | null } {
  if (!byStatus) return { successPct: null, errorPct: null, failures: null };
  const entries = Object.entries(byStatus);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (total <= 0) return { successPct: null, errorPct: null, failures: null };

  let success = 0;
  let error = 0;
  for (const [status, count] of entries) {
    const s = status.toLowerCase();
    if (
      s.includes("success") ||
      s.includes("succeed") ||
      s === "ok" ||
      s === "completed" ||
      s === "complete"
    ) {
      success += count;
    } else if (
      s.includes("fail") ||
      s.includes("error") ||
      s.includes("timeout") ||
      s === "cancelled" ||
      s === "canceled"
    ) {
      error += count;
    }
  }

  if (success + error <= 0) return { successPct: null, errorPct: null, failures: null };
  return {
    successPct: Math.round((success / total) * 1000) / 10,
    errorPct: Math.round((error / total) * 1000) / 10,
    failures: error,
  };
}

export function rankTopModels(records: CostRecordLike[], limit = 5): NamedUsage[] {
  const map = new Map<string, NamedUsage>();
  let totalTokens = 0;
  let totalCost = 0;

  for (const record of records) {
    const label = record.model?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const tokens = Number(record.total_tokens ?? 0);
    const cost = Number(record.estimated_cost ?? 0);
    const existing = map.get(key) ?? {
      key,
      label,
      tokens: 0,
      requests: 0,
      cost: 0,
    };
    existing.tokens += tokens;
    existing.cost = (existing.cost ?? 0) + cost;
    existing.requests += 1;
    map.set(key, existing);
    totalTokens += tokens;
    totalCost += cost;
  }

  return Array.from(map.values())
    .filter((m) => m.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, limit)
    .map((m) => ({
      ...m,
      usagePct:
        totalTokens > 0 ? Math.round((m.tokens / totalTokens) * 1000) / 10 : undefined,
      costPct:
        totalCost > 0
          ? Math.round(((m.cost ?? 0) / totalCost) * 1000) / 10
          : undefined,
    }));
}

const FEATURE_RULES: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  {
    key: "crm",
    label: "CRM AI",
    patterns: [/crm/, /lead/, /customer/, /contact/, /sales/],
  },
  {
    key: "knowledge",
    label: "Knowledge",
    patterns: [/knowledge/, /rag/, /document/, /kb/, /search/],
  },
  {
    key: "employee",
    label: "Employee",
    patterns: [/employee/, /assistant/, /chat/, /copilot/, /agent/],
  },
  {
    key: "operations",
    label: "Operations",
    patterns: [/operation/, /booking/, /schedule/, /ops/, /workflow/],
  },
];

export function classifyAiFeature(templateKey: string | null | undefined): string | null {
  if (!templateKey?.trim()) return null;
  const value = templateKey.toLowerCase();
  for (const rule of FEATURE_RULES) {
    if (rule.patterns.some((p) => p.test(value))) return rule.key;
  }
  return null;
}

export function rankTopFeatures(
  analyticsRecords: AnalyticsRecordLike[],
  limit = 5,
): NamedUsage[] {
  const map = new Map<string, NamedUsage>();
  for (const record of analyticsRecords) {
    const featureKey = classifyAiFeature(record.template_key);
    if (!featureKey) continue;
    const rule = FEATURE_RULES.find((r) => r.key === featureKey)!;
    const existing = map.get(featureKey) ?? {
      key: featureKey,
      label: rule.label,
      tokens: 0,
      requests: 0,
    };
    existing.tokens += Number(record.total_tokens ?? 0);
    existing.requests += 1;
    map.set(featureKey, existing);
  }
  return Array.from(map.values())
    .filter((f) => f.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, limit);
}

export function computeExecutiveAiUsage(input: {
  aggregate: {
    totalTokens: number;
    totalCost: number;
    currency: string;
    recordCount: number;
    byProvider: Record<string, { totalTokens: number; totalCost: number; recordCount: number }>;
    billingPeriod?: string;
  } | null;
  records: CostRecordLike[];
  analytics: {
    averageLatencyMs?: number | null;
    byStatus?: Record<string, number>;
    totalExecutions?: number;
    totalRetries?: number | null;
  } | null;
  analyticsRecords?: AnalyticsRecordLike[];
  monthlyQuota: number | null;
  now?: Date;
}): ExecutiveAiUsageMetrics {
  const now = input.now ?? new Date();
  const today = todayKey(now);
  const yesterday = shiftDayKey(today, -1);
  const aggregate = input.aggregate;
  const used = Number(aggregate?.totalTokens ?? 0);
  const costThisMonth = Number(aggregate?.totalCost ?? 0);
  const currency = aggregate?.currency || getCompanyCurrency();
  const requestsThisMonth = Number(aggregate?.recordCount ?? 0);

  const providerEntries = Object.entries(aggregate?.byProvider ?? {});
  providerEntries.sort((a, b) => b[1].totalTokens - a[1].totalTokens);
  const provider = providerEntries[0]?.[0] ?? null;

  const topModels = rankTopModels(input.records);
  const model =
    topModels[0]?.label ?? input.records.find((r) => r.model?.trim())?.model?.trim() ?? null;

  const monthlyQuota =
    input.monthlyQuota != null && input.monthlyQuota > 0 ? input.monthlyQuota : null;
  const remaining = monthlyQuota != null ? Math.max(0, monthlyQuota - used) : null;
  const overageTokens =
    monthlyQuota != null && used > monthlyQuota ? used - monthlyQuota : null;
  const quotaPctRaw =
    monthlyQuota != null ? Math.round((used / monthlyQuota) * 1000) / 10 : null;
  const quotaPct = quotaPctRaw != null ? Math.min(100, quotaPctRaw) : null;
  const remainingPct =
    monthlyQuota != null
      ? Math.round((Math.max(0, monthlyQuota - used) / monthlyQuota) * 1000) / 10
      : null;
  const overQuota = monthlyQuota != null && used > monthlyQuota;
  const tone = quotaTone(quotaPctRaw, overQuota);
  const warningLevel = deriveQuotaWarningLevel(remainingPct, overQuota);

  const unitCost = used > 0 ? costThisMonth / used : null;
  const estimatedExtraCost =
    overageTokens != null && unitCost != null ? overageTokens * unitCost : null;

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const estimatedMonthEndCost =
    dayOfMonth > 0 && costThisMonth > 0
      ? (costThisMonth / dayOfMonth) * daysInMonth
      : null;
  const estimatedMonthEndUsage =
    dayOfMonth > 0 && used > 0 ? Math.round((used / dayOfMonth) * daysInMonth) : null;

  const dailySeries = buildDailyUsageSeries(input.records, 30, now);
  const todayPoint = dailySeries.find((d) => d.dateKey === today) ?? null;
  const yesterdayPoint = dailySeries.find((d) => d.dateKey === yesterday) ?? null;

  const tokensToday =
    dailySeries.length > 0 && todayPoint ? todayPoint.tokens : null;
  const tokensYesterday =
    dailySeries.length > 0 && yesterdayPoint ? yesterdayPoint.tokens : null;
  const costToday =
    todayPoint && todayPoint.requests > 0 ? todayPoint.cost : null;
  const requestsToday =
    todayPoint && todayPoint.requests > 0 ? todayPoint.requests : null;

  const average7DayTokens =
    dailySeries.length >= 7 ? meanTokens(dailySeries.slice(-7)) : null;
  const average30DayTokens =
    dailySeries.length > 0 ? meanTokens(dailySeries) : null;

  const activeDays = dailySeries.filter((d) => d.tokens > 0).length;
  const averageDailyTokens =
    average30DayTokens != null
      ? average30DayTokens
      : dayOfMonth > 0 && used > 0
        ? Math.round(used / dayOfMonth)
        : activeDays > 0
          ? Math.round(dailySeries.reduce((s, d) => s + d.tokens, 0) / activeDays)
          : null;

  const consumptionRate =
    averageDailyTokens != null && averageDailyTokens > 0
      ? averageDailyTokens
      : dayOfMonth > 0 && used > 0
        ? Math.round(used / dayOfMonth)
        : null;

  const estimatedFinishDays =
    remaining != null && consumptionRate != null && consumptionRate > 0 && !overQuota
      ? Math.max(1, Math.ceil(remaining / consumptionRate))
      : null;

  let estimatedFinishDate: string | null = null;
  if (estimatedFinishDays != null) {
    const finish = new Date(now);
    finish.setDate(finish.getDate() + estimatedFinishDays);
    estimatedFinishDate = finish.toISOString().slice(0, 10);
  }

  const averageTokensPerRequest =
    requestsThisMonth > 0 ? Math.round(used / requestsThisMonth) : null;

  const { successPct, errorPct, failures } = deriveSuccessErrorPct(
    input.analytics?.byStatus,
  );
  const averageLatencyMs =
    input.analytics?.averageLatencyMs != null &&
    Number.isFinite(input.analytics.averageLatencyMs)
      ? Math.round(input.analytics.averageLatencyMs)
      : null;
  const retries =
    input.analytics?.totalRetries != null && Number.isFinite(input.analytics.totalRetries)
      ? Number(input.analytics.totalRetries)
      : null;

  const topFeatures = rankTopFeatures(input.analyticsRecords ?? []);

  return {
    provider,
    model,
    monthlyQuota,
    used,
    remaining,
    quotaPct,
    quotaPctRaw,
    remainingPct,
    tone,
    warningLevel,
    costThisMonth,
    costToday,
    currency,
    estimatedMonthEndCost,
    estimatedMonthEndUsage,
    estimatedFinishDays,
    estimatedFinishDate,
    averageDailyTokens,
    averageTokensPerRequest,
    tokensToday,
    tokensYesterday,
    average7DayTokens,
    average30DayTokens,
    requestsToday,
    requestsThisMonth,
    averageLatencyMs,
    successPct,
    errorPct,
    failures,
    retries,
    overageTokens,
    estimatedExtraCost,
    dailySeries,
    topModels,
    topFeatures,
    hasUsage: used > 0 || requestsThisMonth > 0 || costThisMonth > 0,
  };
}
