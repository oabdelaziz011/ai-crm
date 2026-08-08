import {
  registerDefaultWorkflows,
  resolveWorkflowEngine,
  type OperationsDashboardKpiConfig,
  type OperationsRow,
  type OperationsWorkspaceConfig,
} from "@workspace/universal-operations-engine";
import { isAppointmentLate } from "@/lib/universal-operations/appointment-timing";
import { resolveOperationsStatusKey } from "@/lib/i18n/operations-queue-labels";

registerDefaultWorkflows({ includeExamples: true });

export type ResolvedQueueKpi = {
  id: string;
  label: string;
  metricKey: string;
  value: string | number;
  accent?: "warning" | "success" | "danger";
};

/** Queue 2.2 live operational KPI strip. */
const ENTERPRISE_KPIS: OperationsDashboardKpiConfig[] = [
  { id: "kpi_appointments_today", label: "Appointments Today", metricKey: "appointments_today", visible: true },
  { id: "kpi_waiting", label: "Waiting", metricKey: "waiting", visible: true },
  { id: "kpi_checked_in", label: "Checked In", metricKey: "checked_in", visible: true },
  { id: "kpi_in_progress", label: "In Progress", metricKey: "in_progress", visible: true },
  { id: "kpi_late", label: "Late", metricKey: "late", visible: true },
  { id: "kpi_completed", label: "Completed", metricKey: "completed", visible: true },
  { id: "kpi_cancelled", label: "Cancelled", metricKey: "cancelled", visible: true },
  { id: "kpi_pending_payments", label: "Pending Payments", metricKey: "pending_payments", visible: true },
  { id: "kpi_revenue_today", label: "Revenue Today", metricKey: "revenue_today", visible: true },
];

function statusIdByInternalName(config: OperationsWorkspaceConfig | undefined, internalName: string): string | undefined {
  return config?.statuses.find((s) => s.internalName === internalName)?.id;
}

function paymentIdsByInternalNames(
  config: OperationsWorkspaceConfig | undefined,
  names: string[],
): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const id = config?.paymentStatuses.find((s) => s.internalName === name)?.id;
    if (id) set.add(id);
  }
  return set;
}

function formatCurrencyCents(
  cents: number,
  currency: string,
  translate?: (key: string, options?: { defaultValue?: string }) => string,
): string {
  const code = (currency || "USD").toUpperCase();
  const amount = (Number(cents) || 0) / 100;
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (!translate) return `${formatted} ${code}`;
  const symbolKey = `universalOperations.currency.${code}`;
  const symbol = translate(symbolKey, { defaultValue: code });
  return `${formatted} ${symbol}`;
}

function sumAmount(rows: OperationsRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.values.amount) || 0), 0);
}

function statusIdsForBucket(
  config: OperationsWorkspaceConfig | undefined,
  templateKey: string,
  metricKey: string,
): Set<string> {
  const engine = resolveWorkflowEngine(templateKey);
  const names = engine?.kpiStatusInternalNames(metricKey) ?? [];
  const ids = new Set<string>();
  for (const name of names) {
    const id = statusIdByInternalName(config, name);
    if (id) ids.add(id);
  }
  return ids;
}

function countByStatusKeys(rows: OperationsRow[], keys: string[]): number {
  const wanted = new Set(keys);
  return rows.filter((row) => {
    const key = resolveOperationsStatusKey(row.statusId, row.values.status, null);
    return key != null && wanted.has(key);
  }).length;
}

function resolveMetricValue(
  metricKey: string,
  rows: OperationsRow[],
  total: number,
  config: OperationsWorkspaceConfig | undefined,
  templateKey: string,
  currency: string,
  translate?: (key: string, options?: { defaultValue?: string }) => string,
): string | number {
  const completedIds = statusIdsForBucket(config, templateKey, "completed");
  const paidIds = paymentIdsByInternalNames(config, ["paid"]);
  const pendingPayIds = paymentIdsByInternalNames(config, ["unpaid", "pending", "partial"]);

  switch (metricKey) {
    case "appointments_today":
    case "today_operations":
    case "total":
      return total || rows.length;
    case "waiting": {
      const waitingIds = statusIdsForBucket(config, templateKey, "waiting");
      if (waitingIds.size) return rows.filter((r) => waitingIds.has(r.statusId)).length;
      return countByStatusKeys(rows, ["waiting", "scheduled", "pending", "booked", "confirmed"]);
    }
    case "checked_in":
      return countByStatusKeys(rows, ["checked_in"]);
    case "in_progress": {
      const activeIds = statusIdsForBucket(config, templateKey, "in_progress");
      if (activeIds.size) return rows.filter((r) => activeIds.has(r.statusId)).length;
      return countByStatusKeys(rows, ["in_progress", "with_nurse", "with_doctor"]);
    }
    case "late":
      return rows.filter((row) => isAppointmentLate(row)).length;
    case "completed":
      if (completedIds.size) return rows.filter((r) => completedIds.has(r.statusId)).length;
      return countByStatusKeys(rows, ["completed"]);
    case "cancelled":
      return countByStatusKeys(rows, ["cancelled", "archived", "no_show"]);
    case "pending_payments":
    case "outstanding_payments":
      return rows.filter((r) => pendingPayIds.has(r.paymentStatusId)).length;
    case "revenue_today":
    case "revenue":
      return formatCurrencyCents(
        sumAmount(rows.filter((r) => paidIds.has(r.paymentStatusId))),
        currency,
        translate,
      );
    case "paid":
      return paidIds.size ? rows.filter((r) => paidIds.has(r.paymentStatusId)).length : 0;
    default:
      return 0;
  }
}

function accentForMetric(metricKey: string): ResolvedQueueKpi["accent"] {
  if (metricKey === "waiting" || metricKey === "pending_payments" || metricKey === "outstanding_payments") return "warning";
  if (metricKey === "late" || metricKey === "cancelled") return "danger";
  if (metricKey === "completed" || metricKey === "revenue_today" || metricKey === "revenue") return "success";
  return undefined;
}

const METRIC_LABEL_KEYS: Record<string, string> = {
  appointments_today: "universalOperations.kpi.appointmentsToday",
  today_operations: "universalOperations.kpi.appointmentsToday",
  total: "universalOperations.kpi.appointmentsToday",
  waiting: "universalOperations.kpi.waiting",
  checked_in: "universalOperations.kpi.checkedIn",
  in_progress: "universalOperations.kpi.inProgress",
  late: "universalOperations.kpi.late",
  completed: "universalOperations.kpi.completed",
  cancelled: "universalOperations.kpi.cancelled",
  pending_payments: "universalOperations.kpi.pendingPayments",
  outstanding_payments: "universalOperations.kpi.pendingPayments",
  revenue_today: "universalOperations.kpi.revenueToday",
  revenue: "universalOperations.kpi.revenueToday",
  paid: "universalOperations.kpi.paid",
};

/** Resolve visible queue KPIs from live row data (Queue 2.2 operational strip). */
export function resolveQueueKpis(
  config: OperationsWorkspaceConfig | undefined,
  rows: OperationsRow[],
  total: number,
  translate?: (key: string, options?: { defaultValue?: string }) => string,
  templateKey = "clinic",
  currency = "USD",
): ResolvedQueueKpi[] {
  return ENTERPRISE_KPIS.map((kpi) => {
    const labelKey = METRIC_LABEL_KEYS[kpi.metricKey];
    const label =
      translate && labelKey ? translate(labelKey, { defaultValue: kpi.label }) : kpi.label;
    return {
      id: kpi.id,
      label,
      metricKey: kpi.metricKey,
      value: resolveMetricValue(kpi.metricKey, rows, total, config, templateKey, currency, translate),
      accent: accentForMetric(kpi.metricKey),
    };
  });
}
