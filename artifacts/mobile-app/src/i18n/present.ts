import { translate, type AppLanguage, type MessageKey } from "./catalog";

/** Known stored codes. The original value is never rewritten. */
const STORED_LABELS: Record<string, MessageKey> = {
  open: "statusOpen",
  in_progress: "statusInProgress",
  waiting_customer: "statusWaitingCustomer",
  pending: "statusPending",
  resolved: "statusResolved",
  closed: "statusClosed",
  low: "priorityLow",
  normal: "priorityNormal",
  medium: "priorityMedium",
  high: "priorityHigh",
  urgent: "priorityUrgent",
  new: "statusNew",
  qualified: "statusQualified",
  contacted: "statusContacted",
  demo_scheduled: "statusDemoScheduled",
  demo_completed: "statusDemoCompleted",
  proposal_sent: "statusProposalSent",
  negotiation: "statusNegotiation",
  won: "statusWon",
  lost: "statusLost",
  converted: "statusConverted",
  archived: "statusArchived",
  active: "statusActive",
  trial: "statusTrial",
  inactive: "statusInactive",
  idle: "statusIdle",
  whatsapp: "whatsapp",
  instagram: "instagram",
  messenger: "facebook",
  facebook: "facebook",
  web_chat: "webChat",
  email: "emailModule",
};

export function presentStoredValue(language: AppLanguage, value: unknown): string {
  const original = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!original) return "";
  const key = original.toLowerCase().replace(/[\s-]+/g, "_");
  const message = STORED_LABELS[key];
  return message ? translate(language, message) : original;
}

export function aiDraftInstruction(language: AppLanguage): string {
  return translate(language, "aiDraftInstruction");
}

export function formatLocaleDate(language: AppLanguage, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatLocaleNumber(language: AppLanguage, value: number): string {
  return new Intl.NumberFormat(language).format(value);
}

export function queryErrorText(language: AppLanguage, error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "not_found") return translate(language, "notFound");
  return message || translate(language, "error");
}

const AUTH_CODES: Record<string, MessageKey> = {
  invalid_instance: "invalidInstance",
  empty_credentials: "emptyCredentials",
  invalid_email: "invalidEmail",
  invalid_credentials: "invalidCredentials",
  recovery_failed: "recoveryFailed",
  session_expired: "sessionExpired",
  sign_out: "sessionExpired",
  forbidden: "noPermission",
  cross_tenant: "linkDenied",
  session_rejected: "linkDenied",
  network_error: "networkError",
  not_found: "notFound",
  confirmation_required: "confirmationRequired",
  delivery_failed: "deliveryFailed",
};

export function localizeAuthMessage(language: AppLanguage, code: string): string {
  return presentClientCode(language, code) ?? translate(language, "error");
}

export function presentClientCode(language: AppLanguage, code: string): string | null {
  const key = AUTH_CODES[code];
  return key ? translate(language, key) : null;
}
