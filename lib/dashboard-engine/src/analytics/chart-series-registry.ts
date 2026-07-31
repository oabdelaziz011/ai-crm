import type { DashboardChartSeries } from "./analytics-types.js";
import type { DashboardMetricCategory } from "../types.js";

export type DashboardChartSeriesDefinition = {
  id: string;
  metricKey: string;
  category: DashboardMetricCategory;
  label: string;
};

export const DASHBOARD_CHART_SERIES_DEFINITIONS: DashboardChartSeriesDefinition[] = [
  { id: "crm.customer_growth", metricKey: "crm.customers.new", category: "crm", label: "Customer Growth" },
  { id: "crm.leads", metricKey: "crm.leads", category: "crm", label: "Leads" },
  { id: "crm.deals", metricKey: "crm.deals", category: "crm", label: "Deals" },
  { id: "finance.revenue", metricKey: "finance.revenue", category: "finance", label: "Revenue" },
  { id: "finance.invoices", metricKey: "invoices.outstanding", category: "finance", label: "Invoices" },
  { id: "finance.collections", metricKey: "finance.revenue", category: "finance", label: "Collections" },
  { id: "support.open_tickets", metricKey: "support.tickets.open", category: "support", label: "Open Tickets" },
  { id: "support.sla", metricKey: "support.sla.compliance", category: "support", label: "SLA Compliance" },
  { id: "support.response_time", metricKey: "support.response.avg_minutes", category: "support", label: "Response Time" },
  { id: "ai.conversations", metricKey: "ai.conversations", category: "ai", label: "Conversations" },
  { id: "ai.tool_calls", metricKey: "ai.tool_calls", category: "ai", label: "Tool Calls" },
  { id: "ai.success_rate", metricKey: "ai.success_rate", category: "ai", label: "Success Rate" },
  { id: "automation.workflow_runs", metricKey: "automation.runs", category: "automation", label: "Workflow Runs" },
  { id: "automation.success_rate", metricKey: "automation.success", category: "automation", label: "Success Rate" },
  { id: "knowledge.retrievals", metricKey: "knowledge.documents.retrieved", category: "knowledge", label: "Retrievals" },
  { id: "knowledge.search_volume", metricKey: "knowledge.searches", category: "knowledge", label: "Search Volume" },
  { id: "channels.whatsapp", metricKey: "channels.whatsapp", category: "channels", label: "WhatsApp" },
  { id: "channels.email", metricKey: "channels.email", category: "channels", label: "Email" },
  { id: "channels.messenger", metricKey: "channels.messenger", category: "channels", label: "Messenger" },
  { id: "channels.instagram", metricKey: "channels.instagram", category: "channels", label: "Instagram" },
];

export function buildChartSeriesFromHistorical(
  definitions: DashboardChartSeriesDefinition[],
  historicalValues: Record<string, DashboardChartSeries["points"]>,
): DashboardChartSeries[] {
  return definitions.map((definition) => ({
    id: definition.id,
    metricKey: definition.metricKey,
    category: definition.category,
    label: definition.label,
    points: historicalValues[definition.metricKey] ?? [],
  }));
}

export function chartMetricKeys(): string[] {
  return [...new Set(DASHBOARD_CHART_SERIES_DEFINITIONS.map((definition) => definition.metricKey))];
}
