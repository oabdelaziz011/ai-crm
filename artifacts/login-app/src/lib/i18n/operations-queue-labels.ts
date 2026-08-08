import type { TFunction } from "i18next";
import type { OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";

const COLUMN_LABEL_KEYS: Record<string, string> = {
  queue_number: "universalOperations.grid.columns.queueNumber",
  reference: "universalOperations.grid.columns.reference",
  appointment_time: "universalOperations.grid.columns.appointmentTime",
  customer: "universalOperations.grid.columns.customer",
  visit_type: "universalOperations.grid.columns.visitType",
  phone: "universalOperations.grid.columns.phone",
  service: "universalOperations.grid.columns.service",
  resource: "universalOperations.grid.columns.doctor",
  status: "universalOperations.grid.columns.status",
  payment_status: "universalOperations.grid.columns.paymentStatus",
  waiting_minutes: "universalOperations.grid.columns.waitingTime",
  duration_minutes: "universalOperations.grid.columns.duration",
  amount: "universalOperations.grid.columns.amount",
  branch: "universalOperations.grid.columns.branch",
  actions: "universalOperations.grid.columns.actions",
};

const STATUS_ALIASES: Record<string, string> = {
  scheduled: "scheduled",
  waiting: "waiting",
  pending: "waiting",
  booked: "waiting",
  confirmed: "scheduled",
  checked_in: "checked_in",
  checkedin: "checked_in",
  with_nurse: "in_progress",
  withnurse: "in_progress",
  with_doctor: "in_progress",
  withdoctor: "in_progress",
  in_progress: "in_progress",
  inprogress: "in_progress",
  completed: "completed",
  archived: "cancelled",
  cancelled: "cancelled",
  canceled: "cancelled",
  no_show: "cancelled",
  noshow: "cancelled",
};

/** Enterprise Queue 2.0 status palette (display override). */
const ENTERPRISE_STATUS_COLORS: Record<string, string> = {
  scheduled: "#6b7280",
  waiting: "#f97316",
  checked_in: "#2563eb",
  in_progress: "#7c3aed",
  with_nurse: "#7c3aed",
  with_doctor: "#7c3aed",
  completed: "#16a34a",
  cancelled: "#dc2626",
  archived: "#dc2626",
  no_show: "#dc2626",
};

const PAYMENT_ALIASES: Record<string, string> = {
  unpaid: "pending",
  pending: "pending",
  partial: "partial",
  partially_paid: "partial",
  partialpaid: "partial",
  paid: "paid",
  refunded: "refunded",
  cancelled: "cancelled",
  canceled: "cancelled",
  failed: "failed",
};

const ENTERPRISE_PAYMENT_COLORS: Record<string, string> = {
  pending: "#ef4444",
  partial: "#f59e0b",
  paid: "#22c55e",
  refunded: "#64748b",
  cancelled: "#94a3b8",
  failed: "#dc2626",
};

const VISIT_TYPE_ALIASES: Record<string, string> = {
  new: "New",
  followup: "FollowUp",
  follow_up: "FollowUp",
  consultation: "Consultation",
  emergency: "Emergency",
  vip: "VIP",
  unknown: "Unknown",
};

const VISIT_TYPE_COLORS: Record<string, string> = {
  New: "#2563eb",
  FollowUp: "#0ea5e9",
  Consultation: "#7c3aed",
  Emergency: "#dc2626",
  VIP: "#ca8a04",
  Unknown: "#64748b",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Industry-specific customer term (Clinic → Patient, Hotel → Guest, …). */
export function translateOperationsCustomerTerm(
  t: TFunction,
  templateKey: string,
  fallback?: string,
): string {
  const byTemplate = `universalOperations.terminologyByTemplate.${templateKey}.customer`;
  const translated = t(byTemplate);
  if (translated !== byTemplate) return translated;
  return t("universalOperations.grid.columns.customer", { defaultValue: fallback ?? "Customer" });
}

/** Queue table header label from i18n (never use raw config English displayName in UI). */
export function translateOperationsQueueColumnHeader(
  t: TFunction,
  internalName: string,
  templateKey: string,
  fallback?: string,
): string {
  if (internalName === "customer") {
    return translateOperationsCustomerTerm(t, templateKey, fallback);
  }
  const key = COLUMN_LABEL_KEYS[internalName];
  if (!key) return fallback ?? internalName;
  return t(key, { defaultValue: fallback ?? internalName });
}

export function resolveOperationsStatusKey(
  statusId: string | undefined,
  rawValue: unknown,
  config?: OperationsWorkspaceConfig | null,
): string | null {
  const fromConfig = statusId
    ? config?.statuses.find((status) => status.id === statusId)?.internalName
    : undefined;
  const token = normalizeToken(String(fromConfig ?? rawValue ?? ""));
  if (!token) return null;
  return STATUS_ALIASES[token] ?? token;
}

export function resolveOperationsPaymentKey(
  paymentStatusId: string | undefined,
  rawValue: unknown,
  config?: OperationsWorkspaceConfig | null,
): string | null {
  const fromConfig = paymentStatusId
    ? config?.paymentStatuses.find((status) => status.id === paymentStatusId)?.internalName
    : undefined;
  const token = normalizeToken(String(fromConfig ?? rawValue ?? ""));
  if (!token) return null;
  return PAYMENT_ALIASES[token] ?? token;
}

export function translateOperationsStatusLabel(
  t: TFunction,
  statusId: string | undefined,
  rawValue: unknown,
  config?: OperationsWorkspaceConfig | null,
): string {
  const key = resolveOperationsStatusKey(statusId, rawValue, config);
  if (!key) return "—";
  const i18nKey = `universalOperations.statuses.${key}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  return String(rawValue ?? key);
}

export function translateOperationsPaymentLabel(
  t: TFunction,
  paymentStatusId: string | undefined,
  rawValue: unknown,
  config?: OperationsWorkspaceConfig | null,
): string {
  const key = resolveOperationsPaymentKey(paymentStatusId, rawValue, config);
  if (!key) return "—";
  const i18nKey = `universalOperations.payments.${key}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  return String(rawValue ?? key);
}

export function resolveOperationsStatusColor(
  statusId: string | undefined,
  rawValue: unknown,
  config?: OperationsWorkspaceConfig | null,
): string | undefined {
  const key = resolveOperationsStatusKey(statusId, rawValue, config);
  if (key && ENTERPRISE_STATUS_COLORS[key]) return ENTERPRISE_STATUS_COLORS[key];
  if (statusId) {
    const byId = config?.statuses.find((status) => status.id === statusId)?.color;
    if (byId) return byId;
  }
  if (!key) return undefined;
  return config?.statuses.find((status) => {
    const mapped = STATUS_ALIASES[normalizeToken(status.internalName)] ?? normalizeToken(status.internalName);
    return mapped === key;
  })?.color;
}

export function resolveOperationsPaymentColor(
  paymentStatusId: string | undefined,
  rawValue: unknown,
  config?: OperationsWorkspaceConfig | null,
): string | undefined {
  const key = resolveOperationsPaymentKey(paymentStatusId, rawValue, config);
  if (key && ENTERPRISE_PAYMENT_COLORS[key]) return ENTERPRISE_PAYMENT_COLORS[key];
  if (paymentStatusId) {
    const byId = config?.paymentStatuses.find((status) => status.id === paymentStatusId)?.color;
    if (byId) return byId;
  }
  if (!key) return undefined;
  return config?.paymentStatuses.find((status) => {
    const mapped = PAYMENT_ALIASES[normalizeToken(status.internalName)] ?? normalizeToken(status.internalName);
    return mapped === key;
  })?.color;
}

export function resolveOperationsVisitTypeKey(rawValue: unknown): string {
  const token = normalizeToken(String(rawValue ?? ""));
  if (!token) return "Unknown";
  return VISIT_TYPE_ALIASES[token] ?? (String(rawValue).trim() || "Unknown");
}

export function translateOperationsVisitTypeLabel(t: TFunction, rawValue: unknown): string {
  const key = resolveOperationsVisitTypeKey(rawValue);
  const i18nKey = `universalOperations.visitTypes.${key}`;
  const translated = t(i18nKey);
  if (translated !== i18nKey) return translated;
  if (key === "FollowUp") return t("universalOperations.visitTypes.FollowUp", { defaultValue: "Follow Up" });
  return key;
}

export function resolveOperationsVisitTypeColor(rawValue: unknown): string {
  const key = resolveOperationsVisitTypeKey(rawValue);
  return VISIT_TYPE_COLORS[key] ?? VISIT_TYPE_COLORS.Unknown;
}

/** Compact amount + company currency symbol (e.g. 250 ر.س). */
export function formatOperationsQueueMoney(
  t: TFunction,
  cents: number,
  currencyCode: string,
): string {
  const code = (currencyCode || "USD").toUpperCase();
  const amount = (Number(cents) || 0) / 100;
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const symbolKey = `universalOperations.currency.${code}`;
  const symbol = t(symbolKey);
  const displaySymbol = symbol === symbolKey ? code : symbol;
  return `${formatted} ${displaySymbol}`;
}
