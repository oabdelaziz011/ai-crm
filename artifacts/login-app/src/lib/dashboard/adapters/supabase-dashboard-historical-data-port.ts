import { supabase } from "@/lib/supabase";
import type {
  DashboardHistoricalBucket,
  DashboardHistoricalDataPort,
  DashboardHistoricalDataRequest,
} from "@workspace/dashboard-engine";

type MetricQueryPlan = {
  table: string;
  valueColumn?: string;
  timestampColumn: string;
  aggregate?: "count" | "sum";
};

const METRIC_QUERY_PLANS: Partial<Record<string, MetricQueryPlan>> = {
  "crm.customers.total": { table: "customers", timestampColumn: "created_at", aggregate: "count" },
  "crm.customers.new": { table: "customers", timestampColumn: "created_at", aggregate: "count" },
  "crm.leads": { table: "demo_crm_scenarios", timestampColumn: "created_at", aggregate: "count" },
  "crm.deals": { table: "demo_crm_scenarios", timestampColumn: "created_at", aggregate: "count" },
  "finance.revenue": { table: "invoices", valueColumn: "amount", timestampColumn: "invoice_date", aggregate: "sum" },
  "invoices.outstanding": { table: "invoices", timestampColumn: "created_at", aggregate: "count" },
  "support.tickets.open": { table: "conversations", timestampColumn: "created_at", aggregate: "count" },
  "support.sla.compliance": { table: "conversations", timestampColumn: "created_at", aggregate: "count" },
  "support.response.avg_minutes": { table: "conversations", timestampColumn: "created_at", aggregate: "count" },
  "ai.conversations": { table: "conversations", timestampColumn: "created_at", aggregate: "count" },
  "ai.tool_calls": { table: "tool_executions", timestampColumn: "started_at", aggregate: "count" },
  "ai.success_rate": { table: "ai_execution_analytics", timestampColumn: "recorded_at", aggregate: "count" },
  "automation.runs": { table: "automation_executions", timestampColumn: "created_at", aggregate: "count" },
  "automation.success": { table: "automation_executions", timestampColumn: "created_at", aggregate: "count" },
  "knowledge.searches": { table: "vector_query_executions", timestampColumn: "created_at", aggregate: "count" },
  "knowledge.documents.retrieved": { table: "retrieval_contexts", valueColumn: "chunk_count", timestampColumn: "created_at", aggregate: "sum" },
  "channels.whatsapp": { table: "whatsapp_delivery_logs", timestampColumn: "created_at", aggregate: "count" },
  "channels.email": { table: "email_delivery_logs", timestampColumn: "created_at", aggregate: "count" },
  "channels.messenger": { table: "conversations", timestampColumn: "created_at", aggregate: "count" },
  "channels.instagram": { table: "conversations", timestampColumn: "created_at", aggregate: "count" },
  "bookings.total": { table: "bookings", timestampColumn: "booking_date", aggregate: "count" },
};

function enumerateDays(startAt: string, endAt: string): string[] {
  const days: string[] = [];
  const cursor = new Date(startAt);
  const end = new Date(endAt);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

async function fetchMetricDayValue(
  companyId: string,
  metricKey: string,
  day: string,
  plan: MetricQueryPlan,
): Promise<number> {
  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = `${day}T23:59:59.999Z`;

  if (plan.aggregate === "sum" && plan.valueColumn) {
    const { data, error } = await supabase
      .from(plan.table)
      .select(plan.valueColumn)
      .eq("company_id", companyId)
      .gte(plan.timestampColumn, dayStart)
      .lte(plan.timestampColumn, dayEnd);

    if (error) return 0;
    return (data ?? []).reduce((total, row) => {
      const record = row as unknown as Record<string, unknown>;
      const value = Number(record[plan.valueColumn ?? ""] ?? 0);
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  const { count, error } = await supabase
    .from(plan.table)
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte(plan.timestampColumn, dayStart)
    .lte(plan.timestampColumn, dayEnd);

  if (error) return 0;
  return count ?? 0;
}

export function createSupabaseDashboardHistoricalDataPort(): DashboardHistoricalDataPort {
  return {
    async fetchPeriodBuckets(request: DashboardHistoricalDataRequest): Promise<DashboardHistoricalBucket[]> {
      const days = enumerateDays(request.periodStart, request.periodEnd);
      const buckets: DashboardHistoricalBucket[] = [];

      await Promise.all(
        request.metricKeys.map(async (metricKey: string) => {
          const plan = METRIC_QUERY_PLANS[metricKey];
          if (!plan) return;

          for (const day of days) {
            const value = await fetchMetricDayValue(request.companyId, metricKey, day, plan);
            buckets.push({
              metricKey,
              periodStart: `${day}T00:00:00.000Z`,
              periodEnd: `${day}T23:59:59.999Z`,
              value,
            });
          }
        }),
      );

      return buckets.sort(
        (left, right) => new Date(left.periodStart).getTime() - new Date(right.periodStart).getTime(),
      );
    },
  };
}
