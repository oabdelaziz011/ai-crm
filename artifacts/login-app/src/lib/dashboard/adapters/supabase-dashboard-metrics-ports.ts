import { supabase } from "@/lib/supabase";
import type {
  AiMetricsData,
  AutomationMetricsData,
  ChannelsMetricsData,
  CrmMetricsData,
  DashboardMetricsPorts,
  KnowledgeMetricsData,
  SupportMetricsData,
} from "@workspace/dashboard-engine";

const ACTIVE_CUSTOMER_DAYS = 90;
const NEW_CUSTOMER_DAYS = 30;

function startOfTodayIso(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

async function countExact(table: string, companyId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function sumInvoiceAmount(
  companyId: string,
  status: string | string[],
  since?: string,
  until?: string,
): Promise<number> {
  let query = supabase.from("invoices").select("amount").eq("company_id", companyId);
  if (Array.isArray(status)) query = query.in("status", status);
  else query = query.eq("status", status);
  if (since) query = query.gte("invoice_date", since);
  if (until) query = query.lt("invoice_date", until);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total, row) => total + Number(row.amount ?? 0), 0);
}

export function createSupabaseDashboardMetricsPorts(): DashboardMetricsPorts {
  return {
    crm: {
      async fetchMetrics(companyId: string): Promise<CrmMetricsData> {
        const sinceActive = daysAgoIso(ACTIVE_CUSTOMER_DAYS);
        const sinceNew = daysAgoIso(NEW_CUSTOMER_DAYS);

        const [
          totalCustomers,
          activeCustomers,
          newCustomers,
          pipelineValue,
        ] = await Promise.all([
          countExact("customers", companyId),
          supabase
            .from("customers")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .gte("updated_at", sinceActive)
            .then(({ count, error }) => {
              if (error) throw new Error(error.message);
              return count ?? 0;
            }),
          supabase
            .from("customers")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .gte("created_at", sinceNew)
            .then(({ count, error }) => {
              if (error) throw new Error(error.message);
              return count ?? 0;
            }),
          sumInvoiceAmount(companyId, ["Unpaid", "Overdue"]),
        ]);

        let leads = 0;
        let deals = 0;
        try {
          const [leadResult, dealResult] = await Promise.all([
            supabase
              .from("demo_crm_scenarios")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .in("scenario_type", ["lead_hot", "lead_cold"]),
            supabase
              .from("demo_crm_scenarios")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .in("scenario_type", ["deal_won", "deal_lost", "opportunity_open"]),
          ]);
          leads = leadResult.count ?? 0;
          deals = dealResult.count ?? 0;
        } catch {
          leads = 0;
          deals = 0;
        }

        return {
          totalCustomers,
          activeCustomers,
          newCustomers,
          leads,
          deals,
          pipelineValue,
        };
      },
    },
    support: {
      async fetchMetrics(companyId: string): Promise<SupportMetricsData> {
        const todayStart = startOfTodayIso();
        const openStates = ["waiting_user", "transferred_to_human", "waiting_api", "collecting_information"];

        const [openResult, closedResult] = await Promise.all([
          supabase
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .in("state", openStates)
            .is("deleted_at", null),
          supabase
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("state", "closed")
            .gte("ended_at", todayStart)
            .is("deleted_at", null),
        ]);

        const openTickets = openResult.count ?? 0;
        const closedToday = closedResult.count ?? 0;
        const slaCompliancePercent =
          openTickets + closedToday > 0
            ? Math.round((closedToday / (openTickets + closedToday)) * 1000) / 10
            : 100;

        return {
          openTickets,
          closedToday,
          slaCompliancePercent,
          averageResponseMinutes: 0,
          averageResolutionMinutes: 0,
        };
      },
    },
    ai: {
      async fetchMetrics(companyId: string): Promise<AiMetricsData> {
        const since = daysAgoIso(30);

        const [conversations, toolCalls, escalations, completedExecutions, totalExecutions] =
          await Promise.all([
            supabase
              .from("conversations")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .gte("created_at", since)
              .is("deleted_at", null)
              .then(({ count }) => count ?? 0),
            supabase
              .from("tool_executions")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .gte("started_at", since)
              .then(({ count }) => count ?? 0),
            supabase
              .from("conversations")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .eq("state", "transferred_to_human")
              .gte("created_at", since)
              .then(({ count }) => count ?? 0),
            supabase
              .from("ai_execution_analytics")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .eq("execution_status", "completed")
              .gte("recorded_at", since)
              .then(({ count }) => count ?? 0),
            supabase
              .from("ai_execution_analytics")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .gte("recorded_at", since)
              .then(({ count }) => count ?? 0),
          ]);

        const successRatePercent =
          totalExecutions > 0
            ? Math.round((completedExecutions / totalExecutions) * 1000) / 10
            : 0;

        return {
          conversations,
          successRatePercent,
          toolCalls,
          escalations,
          estimatedHoursSaved: Math.round((toolCalls * 4) / 60),
        };
      },
    },
    automation: {
      async fetchMetrics(companyId: string): Promise<AutomationMetricsData> {
        const since = daysAgoIso(30);

        const [workflowRuns, successCount, failureCount, runningCount, durationRows] =
          await Promise.all([
            supabase
              .from("automation_executions")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .gte("created_at", since)
              .then(({ count }) => count ?? 0),
            supabase
              .from("automation_executions")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .eq("status", "completed")
              .gte("created_at", since)
              .then(({ count }) => count ?? 0),
            supabase
              .from("automation_executions")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .eq("status", "failed")
              .gte("created_at", since)
              .then(({ count }) => count ?? 0),
            supabase
              .from("automation_executions")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .in("status", ["pending", "scheduled", "running"])
              .then(({ count }) => count ?? 0),
            supabase
              .from("automation_execution_history")
              .select("duration_ms")
              .eq("company_id", companyId)
              .then(({ data }) => data ?? []),
          ]);

        const durations = durationRows
          .map((row) => Number(row.duration_ms))
          .filter((value) => Number.isFinite(value));
        const averageRuntimeMs =
          durations.length > 0
            ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
            : 0;

        return {
          workflowRuns,
          successCount,
          failureCount,
          runningCount,
          averageRuntimeMs,
        };
      },
    },
    knowledge: {
      async fetchMetrics(companyId: string): Promise<KnowledgeMetricsData> {
        const since = daysAgoIso(30);

        const [searches, completed, contextRows, metricRows] = await Promise.all([
          supabase
            .from("vector_query_executions")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .gte("created_at", since)
            .then(({ count }) => count ?? 0),
          supabase
            .from("retrieval_executions")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("execution_status", "completed")
            .gte("created_at", since)
            .then(({ count }) => count ?? 0),
          supabase
            .from("retrieval_contexts")
            .select("chunk_count")
            .eq("company_id", companyId)
            .gte("created_at", since)
            .is("deleted_at", null)
            .then(({ data }) => data ?? []),
          supabase
            .from("retrieval_metrics")
            .select("duration_ms")
            .eq("company_id", companyId)
            .then(({ data }) => data ?? []),
        ]);

        const retrievedDocuments = contextRows.reduce(
          (total, row) => total + Number(row.chunk_count ?? 0),
          0,
        );
        const durations = metricRows
          .map((row) => Number(row.duration_ms))
          .filter((value) => Number.isFinite(value));
        const averageRetrievalTimeMs =
          durations.length > 0
            ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
            : 0;

        return {
          searches,
          retrievalSuccessRatePercent:
            searches > 0 ? Math.round((completed / searches) * 1000) / 10 : 0,
          retrievedDocuments,
          averageRetrievalTimeMs,
        };
      },
    },
    channels: {
      async fetchMetrics(companyId: string): Promise<ChannelsMetricsData> {
        const since = daysAgoIso(30);

        const [
          whatsappMessages,
          emailMessages,
          messengerMessages,
          instagramMessages,
          whatsappFailed,
          emailFailed,
        ] = await Promise.all([
          supabase
            .from("whatsapp_delivery_logs")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .gte("created_at", since)
            .then(({ count }) => count ?? 0),
          supabase
            .from("email_delivery_logs")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .gte("created_at", since)
            .then(({ count }) => count ?? 0),
          supabase
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("channel_type", "messenger")
            .gte("created_at", since)
            .then(({ count }) => count ?? 0),
          supabase
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("channel_type", "instagram")
            .gte("created_at", since)
            .then(({ count }) => count ?? 0),
          supabase
            .from("whatsapp_delivery_logs")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("status", "failed")
            .gte("created_at", since)
            .then(({ count }) => count ?? 0),
          supabase
            .from("email_delivery_logs")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("status", "failed")
            .gte("created_at", since)
            .then(({ count }) => count ?? 0),
        ]);

        return {
          whatsappMessages,
          emailMessages,
          messengerMessages,
          instagramMessages,
          failedDeliveries: whatsappFailed + emailFailed,
        };
      },
    },
  };
}

export type FinanceMetricsData = {
  revenue: number;
  revenueChangePercent: number | null;
};

export type BookingsMetricsData = {
  bookings: number;
  bookingsChangePercent: number | null;
};

export type InvoicesMetricsData = {
  invoices: number;
  invoicesChangePercent: number | null;
};

export type ExtendedDashboardMetricsPorts = DashboardMetricsPorts & {
  finance: { fetchMetrics(companyId: string): Promise<FinanceMetricsData> };
  bookings: { fetchMetrics(companyId: string): Promise<BookingsMetricsData> };
  invoices: { fetchMetrics(companyId: string): Promise<InvoicesMetricsData> };
};

export function createExtendedSupabaseDashboardMetricsPorts(): ExtendedDashboardMetricsPorts {
  const base = createSupabaseDashboardMetricsPorts();
  const since = daysAgoIso(30);
  const prevSince = daysAgoIso(60);

  return {
    ...base,
    finance: {
      async fetchMetrics(companyId: string): Promise<FinanceMetricsData> {
        const [revenue, previousRevenue] = await Promise.all([
          sumInvoiceAmount(companyId, "Paid", since),
          sumInvoiceAmount(companyId, "Paid", prevSince, since),
        ]);

        return {
          revenue,
          revenueChangePercent:
            previousRevenue > 0
              ? Math.round(((revenue - previousRevenue) / previousRevenue) * 1000) / 10
              : null,
        };
      },
    },
    bookings: {
      async fetchMetrics(companyId: string): Promise<BookingsMetricsData> {
        const todayStart = startOfTodayIso();
        const [bookings, previousBookings] = await Promise.all([
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .gte("booking_date", todayStart)
            .then(({ count }) => count ?? 0),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .gte("booking_date", prevSince)
            .lt("booking_date", since)
            .then(({ count }) => count ?? 0),
        ]);

        return {
          bookings,
          bookingsChangePercent:
            previousBookings > 0
              ? Math.round(((bookings - previousBookings) / previousBookings) * 1000) / 10
              : null,
        };
      },
    },
    invoices: {
      async fetchMetrics(companyId: string): Promise<InvoicesMetricsData> {
        const [invoices, previousInvoices] = await Promise.all([
          supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .in("status", ["Unpaid", "Overdue"])
            .then(({ count }) => count ?? 0),
          supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .in("status", ["Unpaid", "Overdue"])
            .gte("created_at", prevSince)
            .lt("created_at", since)
            .then(({ count }) => count ?? 0),
        ]);

        return {
          invoices,
          invoicesChangePercent:
            previousInvoices > 0
              ? Math.round(((invoices - previousInvoices) / previousInvoices) * 1000) / 10
              : null,
        };
      },
    },
  };
}
