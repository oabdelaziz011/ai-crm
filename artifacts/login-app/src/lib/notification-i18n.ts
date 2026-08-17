import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { TFunction } from "i18next";
import i18n from "@/i18n";
import type { NotificationItem } from "@/lib/types";

/** Legacy English titles stored before i18n keys were introduced. */
const LEGACY_TITLE_KEYS: Record<string, string> = {
  "New Customer": "notifications.events.newCustomer.title",
  "New Booking": "notifications.events.newBooking.title",
  "Booking Cancelled": "notifications.events.bookingCancelled.title",
  "Invoice Paid": "notifications.events.invoicePaid.title",
  "Invoice Overdue": "notifications.events.invoiceOverdue.title",
  "Subscription expires in 5 days": "notifications.events.subscriptionExpiresSoon.title",
  "Subscription expired": "notifications.events.subscriptionExpired.title",
  "User created": "notifications.events.userCreated.title",
  "User deleted": "notifications.events.userDeleted.title",
  "Role updated": "notifications.events.roleUpdated.title",
  "Role created": "notifications.events.roleCreated.title",
  "WhatsApp failed": "notifications.events.whatsappFailed.title",
  "AI task completed": "notifications.events.aiTaskCompleted.title",
  "Payment collected": "notifications.platform.templates.paymentReceived.title",
  "Invoice paid": "notifications.platform.templates.paymentReceived.title",
  "Invoice generated": "notifications.platform.templates.invoiceCreated.title",
  "تم دفع الفاتورة": "notifications.events.invoicePaid.title",
  "تم استلام دفعة": "notifications.platform.templates.paymentReceived.title",
  "تم إنشاء فاتورة": "notifications.platform.templates.invoiceCreated.title",
  "تم إلغاء موعد": "notifications.platform.templates.appointmentCancelled.title",
  "إشعار النظام": "notifications.platform.templates.genericSystem.title",
};

/** Last-resort fallback for rows stored before messageKey was explicit. */
const LEGACY_MESSAGE_KEYS: Record<string, string> = {
  "notifications.events.newCustomer.title": "notifications.events.newCustomer.message",
  "notifications.events.newBooking.title": "notifications.events.newBooking.message",
  "notifications.events.bookingCancelled.title": "notifications.events.bookingCancelled.message",
  "notifications.events.invoicePaid.title": "notifications.events.invoicePaid.message",
  "notifications.events.invoiceOverdue.title": "notifications.events.invoiceOverdue.message",
  "notifications.events.subscriptionExpiresSoon.title": "notifications.events.subscriptionExpiresSoon.message",
  "notifications.events.subscriptionExpired.title": "notifications.events.subscriptionExpired.message",
  "notifications.events.userCreated.title": "notifications.events.userCreated.message",
  "notifications.events.userDeleted.title": "notifications.events.userDeleted.message",
  "notifications.events.roleUpdated.title": "notifications.events.roleUpdated.message",
  "notifications.events.roleCreated.title": "notifications.events.roleCreated.message",
  "notifications.events.whatsappFailed.title": "notifications.events.whatsappFailed.message",
  "notifications.events.aiTaskCompleted.title": "notifications.events.aiTaskCompleted.message",
};

export type NotificationPayload = {
  messageKey: string | null;
  params: Record<string, string> | null;
};

export type NotificationEntityLabels = {
  customerNameById?: Record<string, string>;
  invoiceNumberById?: Record<string, string>;
  customerNameByBookingId?: Record<string, string>;
  customerNameByInvoiceId?: Record<string, string>;
  customerNameByPaymentId?: Record<string, string>;
  amountByInvoiceId?: Record<string, string>;
  amountByPaymentId?: Record<string, string>;
  invoiceIdByPaymentId?: Record<string, string>;
};

export type NotificationLocalizeContext = {
  event?: string | null;
  category?: string | null;
};

type ComposeKind =
  | "payment"
  | "invoice"
  | "appointment_cancelled"
  | "appointment_created"
  | "appointment_updated"
  | "customer"
  | "system"
  | "generic";

export function resolveNotificationTitleKey(titleKey: string): string {
  if (titleKey.startsWith("notifications.")) {
    return titleKey;
  }
  return LEGACY_TITLE_KEYS[titleKey] ?? titleKey;
}

function toParamRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry ?? "")]),
  );
}

export function parseNotificationPayload(message: string): NotificationPayload {
  const trimmed = message?.trim();
  if (!trimmed) {
    return { messageKey: null, params: {} };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { messageKey: null, params: { detail: trimmed, body: trimmed } };
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.messageKey === "string") {
      return {
        messageKey: record.messageKey,
        params: toParamRecord(record.params),
      };
    }

    return {
      messageKey: null,
      params: toParamRecord(parsed),
    };
  } catch {
    // Plain-text legacy rows — keep the full text as the detail body.
    return {
      messageKey: null,
      params: { detail: trimmed, body: trimmed },
    };
  }
}

function resolveLegacyMessageKey(titleKey: string): string | null {
  return LEGACY_MESSAGE_KEYS[titleKey] ?? null;
}

function fillPlaceholders(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = params[key];
    if (value == null || value === "") return "";
    return value;
  });
}

function hasUnfilledPlaceholders(text: string): boolean {
  return /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/.test(text);
}

function shortId(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.length > 10 ? trimmed.slice(0, 8) : trimmed;
}

function isBlankDetail(value: string | undefined | null, unknowns: string[] = []): boolean {
  const text = value?.trim() ?? "";
  if (!text) return true;
  if (text === "—" || text === "-" || text === "null" || text === "undefined") return true;
  const lowered = text.toLowerCase();
  return unknowns.some((token) => token && lowered === token.toLowerCase());
}

function extractAmountFromText(text: string | undefined): string {
  if (!text?.trim()) return "";
  const patterns = [
    /(?:^|[^\d])(\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*[A-Z]{3})\b/i,
    /(\d+(?:\.\d+)?\s*[A-Z]{3})/i,
    /([A-Z]{3}\s*\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(USD|EGP|SAR|AED|EUR|GBP)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function extractIdsFromNavigation(nav: string | undefined): { invoiceId?: string; paymentId?: string } {
  if (!nav?.trim()) return {};
  try {
    const url = new URL(nav, "https://local.invalid");
    return {
      invoiceId: url.searchParams.get("invoiceId") ?? undefined,
      paymentId: url.searchParams.get("paymentId") ?? undefined,
    };
  } catch {
    const invoiceId = nav.match(/invoiceId=([^&]+)/i)?.[1];
    const paymentId = nav.match(/paymentId=([^&]+)/i)?.[1];
    return {
      invoiceId: invoiceId ? decodeURIComponent(invoiceId) : undefined,
      paymentId: paymentId ? decodeURIComponent(paymentId) : undefined,
    };
  }
}

function applyEntityLabels(
  params: Record<string, string>,
  labels?: NotificationEntityLabels,
): Record<string, string> {
  if (!labels) return params;
  const next = { ...params };
  const fromNav = extractIdsFromNavigation(next.navigationTarget);
  let customerId = next.customerId || next.customer_id || "";
  let invoiceId =
    next.invoiceId ||
    next.invoice_id ||
    fromNav.invoiceId ||
    (next.entityType === "invoice" ? next.entityId : "") ||
    "";
  let bookingId =
    next.bookingId || next.booking_id || (next.entityType === "booking" ? next.entityId : "") || "";
  let paymentId =
    next.paymentId ||
    next.payment_id ||
    fromNav.paymentId ||
    (next.entityType === "payment" ? next.entityId : "") ||
    "";

  if (!paymentId && invoiceId && labels.amountByPaymentId?.[invoiceId]) {
    paymentId = invoiceId;
  }
  if (!paymentId && next.entityId && labels.amountByPaymentId?.[next.entityId]) {
    paymentId = next.entityId;
  }
  if (paymentId && labels.invoiceIdByPaymentId?.[paymentId] && !labels.invoiceNumberById?.[invoiceId]) {
    invoiceId = labels.invoiceIdByPaymentId[paymentId];
  }
  if (!invoiceId && paymentId && labels.invoiceIdByPaymentId?.[paymentId]) {
    invoiceId = labels.invoiceIdByPaymentId[paymentId];
  }
  // entityId may be invoice UUID even when entityType is missing.
  if (!invoiceId && next.entityId && labels.invoiceNumberById?.[next.entityId]) {
    invoiceId = next.entityId;
  }

  if (invoiceId && labels.invoiceNumberById?.[invoiceId]) {
    next.invoiceNumber = labels.invoiceNumberById[invoiceId];
    next.invoiceId = invoiceId;
  }

  const resolvedName =
    (customerId && labels.customerNameById?.[customerId]) ||
    (paymentId && labels.customerNameByPaymentId?.[paymentId]) ||
    (bookingId && labels.customerNameByBookingId?.[bookingId]) ||
    (invoiceId && labels.customerNameByInvoiceId?.[invoiceId]) ||
    "";

  if (resolvedName) {
    next.customerName = resolvedName;
    next.name = resolvedName;
  }

  const resolvedAmount =
    (paymentId && labels.amountByPaymentId?.[paymentId]) ||
    (invoiceId && labels.amountByInvoiceId?.[invoiceId]) ||
    "";
  if (resolvedAmount) {
    next.amount = resolvedAmount;
  }

  if (bookingId && !next.bookingId) next.bookingId = bookingId;
  if (invoiceId && !next.invoiceId) next.invoiceId = invoiceId;
  if (paymentId && !next.paymentId) next.paymentId = paymentId;
  return next;
}

function formatNotificationParams(
  params: Record<string, string>,
  t: TFunction,
  language: string,
  messageKey: string,
  labels?: NotificationEntityLabels,
): Record<string, string> {
  const dateLocale = language === "ar" ? ar : enUS;
  const unknown = t("notifications.defaults.unknown");
  const noReason = t("notifications.defaults.noReason");
  let resolved: Record<string, string> = { ...params };
  resolved = applyEntityLabels(resolved, labels);

  if (!resolved.invoiceId && resolved.invoice_id) resolved.invoiceId = resolved.invoice_id;
  if (!resolved.customerId && resolved.customer_id) resolved.customerId = resolved.customer_id;
  if (!resolved.bookingId && (resolved.booking_id || resolved.appointmentId || resolved.appointment_id)) {
    resolved.bookingId = resolved.booking_id || resolved.appointmentId || resolved.appointment_id;
  }

  if (isBlankDetail(resolved.customerName, [unknown])) {
    const fallback =
      resolved.name?.trim() ||
      resolved.displayName?.trim() ||
      (resolved.customerId ? shortId(resolved.customerId) : "");
    resolved.customerName = fallback && !isBlankDetail(fallback, [unknown]) ? fallback : "";
  }
  if (!resolved.name?.trim() && resolved.customerName) {
    resolved.name = resolved.customerName;
  }

  if (isBlankDetail(resolved.invoiceNumber, [unknown])) {
    if (resolved.invoiceId && /^INV[-_]/i.test(resolved.invoiceId)) {
      resolved.invoiceNumber = resolved.invoiceId;
    } else {
      resolved.invoiceNumber = "";
    }
  }

  if (isBlankDetail(resolved.amount, [unknown])) {
    const cents = Number(resolved.amountCents);
    if (Number.isFinite(cents) && cents > 0) {
      const currency = (resolved.currency || "USD").toUpperCase();
      resolved.amount = `${(cents / 100).toFixed(2)} ${currency}`;
    } else if (resolved.total?.trim()) {
      resolved.amount = resolved.total.trim();
    } else {
      resolved.amount =
        extractAmountFromText(resolved.body) ||
        extractAmountFromText(resolved.detail) ||
        extractAmountFromText(resolved.title) ||
        "";
    }
  }

  if (isBlankDetail(resolved.reason, [noReason, "No reason provided", "A booking was cancelled."])) {
    const body = resolved.body?.trim() ?? "";
    if (
      body &&
      !/^A booking was cancelled\.?$/i.test(body) &&
      !/^No reason provided$/i.test(body) &&
      !/^An invoice was fully paid\.?$/i.test(body) &&
      !/^A payment was received\.?$/i.test(body)
    ) {
      resolved.reason = body;
    } else {
      resolved.reason = "";
    }
  }

  if (!resolved.detail?.trim() && resolved.body?.trim()) {
    resolved.detail = resolved.body;
  }

  if (resolved.service === "") {
    resolved.service = t("notifications.defaults.service");
  }
  if (resolved.companyName === "") {
    resolved.companyName = t("notifications.defaults.company");
  }
  if (resolved.roleName === "") {
    resolved.roleName = t("notifications.defaults.role");
  }
  if (!resolved.detail?.trim()) {
    if (messageKey.includes("whatsappFailed")) {
      resolved.detail = t("notifications.events.whatsappFailed.fallback");
    } else if (messageKey.includes("aiTaskCompleted")) {
      resolved.detail = t("notifications.events.aiTaskCompleted.fallback");
    } else if (resolved.body?.trim()) {
      resolved.detail = resolved.body;
    } else if (resolved.title?.trim() && !resolved.title.startsWith("notifications.")) {
      // Keep operational titles like connection-test errors as detail when body is empty.
      resolved.detail = resolved.title;
    } else {
      resolved.detail = "";
    }
  }
  if (resolved.expiresOn) {
    const parsed = new Date(resolved.expiresOn);
    if (!Number.isNaN(parsed.getTime())) {
      resolved.expiresOn = format(parsed, "PPP", { locale: dateLocale });
    }
  }

  return resolved;
}

function hasValue(value: string | undefined, unknowns: string[]): boolean {
  return !isBlankDetail(value, unknowns);
}

function resolveComposeKind(
  messageKey: string | null,
  titleKey: string,
  ctx?: NotificationLocalizeContext,
): ComposeKind {
  const haystack = [
    messageKey ?? "",
    titleKey,
    ctx?.event ?? "",
    ctx?.category ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (
    /payment|invoicepaid|invoice_paid|تم دفع|استلام دفعة|paymentreceived/.test(haystack)
  ) {
    return "payment";
  }
  if (/invoicecreated|invoice_created|invoicegenerated|تم إنشاء فاتورة/.test(haystack)) {
    return "invoice";
  }
  if (/appointmentcancelled|bookingcancelled|appointment_cancelled|تم إلغاء/.test(haystack)) {
    return "appointment_cancelled";
  }
  if (/appointmentcreated|appointment_created|bookingcreated|تم إنشاء موعد|تم جدولة/.test(haystack)) {
    return "appointment_created";
  }
  if (/appointmentupdated|appointment_updated|تم تحديث موعد/.test(haystack)) {
    return "appointment_updated";
  }
  if (/customercreated|customer_created|newcustomer|عميل جديد/.test(haystack)) {
    return "customer";
  }
  if (/genericsystem|generic_system|whatsapp|system|إشعار النظام/.test(haystack)) {
    return "system";
  }
  return "generic";
}

function isGenericBoilerplate(text: string, title: string): boolean {
  const normalized = text.trim().toLowerCase();
  const titleNorm = title.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === titleNorm) return true;
  return [
    "an invoice was fully paid.",
    "a payment was received.",
    "a booking was cancelled.",
    "a new booking was scheduled.",
    "a booking was confirmed.",
    "system notification",
    "إشعار النظام",
    "تم دفع الفاتورة",
    "تم استلام دفعة",
  ].includes(normalized);
}

function localizeOperationTitle(t: TFunction, rawTitle: string): string {
  const key = OPERATION_TITLE_I18N[rawTitle.trim()];
  if (key && i18n.exists(key)) return t(key);
  const kindKey = `notifications.platform.operations.kinds.${rawTitle.trim()}`;
  if (i18n.exists(kindKey)) return t(kindKey);
  return rawTitle.trim();
}

const HIDDEN_SYSTEM_PARAM_KEYS = new Set([
  "title",
  "body",
  "detail",
  "messageKey",
  "correlationId",
  "navigationTarget",
  "severity",
  "recipientRole",
  "amountCents",
  "currency",
  "entityType",
  "entityId",
]);

function composeSystemOperationMessage(
  t: TFunction,
  params: Record<string, string>,
  fallbackTitle: string,
): { title: string; message: string } {
  const unknown = t("notifications.defaults.unknown");
  const operationTitle = params.title?.trim() || "";
  const localizedTitle =
    operationTitle && !operationTitle.startsWith("notifications.")
      ? localizeOperationTitle(t, operationTitle)
      : fallbackTitle;

  const bits: string[] = [];
  const detail = params.detail?.trim() || "";
  const body = params.body?.trim() || "";
  const primary = [detail, body].find(
    (value) =>
      value &&
      !isGenericBoilerplate(value, fallbackTitle) &&
      !isGenericBoilerplate(value, localizedTitle) &&
      value !== operationTitle,
  );
  if (primary) bits.push(primary);

  if (hasValue(params.subject, [unknown])) {
    bits.push(t("notifications.platform.compose.subjectPart", { subject: params.subject }));
  }
  if (hasValue(params.ticketNumber, [unknown]) || hasValue(params.ticketId, [unknown])) {
    bits.push(
      t("notifications.platform.compose.ticketPart", {
        ticket: params.ticketNumber || shortId(params.ticketId),
      }),
    );
  }
  if (hasValue(params.kind, [unknown])) {
    bits.push(localizeOperationTitle(t, params.kind));
  }
  if (hasValue(params.customerName, [unknown])) {
    bits.push(t("notifications.platform.compose.customerPart", { customer: params.customerName }));
  }
  if (hasValue(params.invoiceNumber, [unknown])) {
    bits.push(t("notifications.platform.compose.invoicePart", { invoice: params.invoiceNumber }));
  }
  if (hasValue(params.amount, [unknown])) {
    bits.push(t("notifications.platform.compose.amountPart", { amount: params.amount }));
  }
  if (hasValue(params.bookingId, [unknown])) {
    bits.push(t("notifications.platform.compose.bookingPart", { booking: shortId(params.bookingId) }));
  }
  if (hasValue(params.conversationId, [unknown])) {
    bits.push(
      t("notifications.platform.compose.conversationPart", {
        conversation: shortId(params.conversationId),
      }),
    );
  }
  if (hasValue(params.leadId, [unknown])) {
    bits.push(t("notifications.platform.compose.leadPart", { lead: shortId(params.leadId) }));
  }
  if (hasValue(params.taskId, [unknown])) {
    bits.push(t("notifications.platform.compose.taskPart", { task: shortId(params.taskId) }));
  }
  if (hasValue(params.fileName, [unknown])) {
    bits.push(t("notifications.platform.compose.filePart", { file: params.fileName }));
  }
  if (hasValue(params.workflowName, [unknown]) || hasValue(params.workflowId, [unknown])) {
    bits.push(
      t("notifications.platform.compose.workflowPart", {
        workflow: params.workflowName || shortId(params.workflowId),
      }),
    );
  }
  if (hasValue(params.reason, [t("notifications.defaults.noReason")])) {
    bits.push(t("notifications.platform.compose.reasonPart", { reason: params.reason }));
  }

  // Any other useful leftover params (skip ids already rendered / internal keys).
  for (const [key, value] of Object.entries(params)) {
    if (HIDDEN_SYSTEM_PARAM_KEYS.has(key)) continue;
    if (
      [
        "subject",
        "ticketNumber",
        "ticketId",
        "kind",
        "customerName",
        "name",
        "invoiceNumber",
        "invoiceId",
        "amount",
        "bookingId",
        "conversationId",
        "leadId",
        "taskId",
        "fileName",
        "workflowName",
        "workflowId",
        "reason",
        "paymentId",
        "customerId",
        "queueId",
        "actorUserId",
        "messageId",
      ].includes(key)
    ) {
      continue;
    }
    if (!hasValue(value, [unknown])) continue;
    if (bits.some((bit) => bit.includes(value))) continue;
    bits.push(`${key}: ${value}`);
  }

  const uniqueBits = bits.filter((bit, index, arr) => bit && arr.indexOf(bit) === index);
  let message = uniqueBits.join(" — ");

  if (!message) {
    message =
      (operationTitle && operationTitle !== localizedTitle ? localizedTitle : "") ||
      localizedTitle ||
      fallbackTitle;
    if (operationTitle && message === fallbackTitle && operationTitle !== fallbackTitle) {
      message = localizedTitle;
    }
  }

  // Prefer operation-specific title over generic "System notification".
  const title =
    localizedTitle && localizedTitle !== t("notifications.platform.templates.genericSystem.title")
      ? localizedTitle
      : uniqueBits.length > 0
        ? localizedTitle || fallbackTitle
        : fallbackTitle;

  return {
    title:
      operationTitle && !isGenericBoilerplate(localizedTitle, fallbackTitle)
        ? localizedTitle
        : title,
    message: message || title,
  };
}

const OPERATION_TITLE_I18N: Record<string, string> = {
  "Operation completed": "notifications.platform.operations.completed",
  "Task assigned": "notifications.platform.operations.taskAssigned",
  "Task completed": "notifications.platform.operations.taskCompleted",
  "Workflow executed": "notifications.platform.operations.workflowExecuted",
  "AI summary ready": "notifications.platform.operations.aiSummary",
  "Knowledge updated": "notifications.platform.operations.knowledgeUpdated",
  "Permission changed": "notifications.platform.operations.permissionChanged",
  "File uploaded": "notifications.platform.operations.fileUploaded",
  "Conversation transferred to you": "notifications.platform.operations.conversationTransferred",
  "Conversation assigned to you": "notifications.platform.operations.conversationAssigned",
  "Conversation escalated": "notifications.platform.operations.conversationEscalated",
  "Conversation entered queue": "notifications.platform.operations.conversationQueued",
  "Handoff accepted": "notifications.platform.operations.handoffAccepted",
  "Handoff rejected": "notifications.platform.operations.handoffRejected",
  "Conversation returned to AI": "notifications.platform.operations.returnedToAi",
  "Supervisor alert": "notifications.platform.operations.supervisorAlert",
  "Handoff notification": "notifications.platform.operations.handoff",
  "Conversation mention": "notifications.platform.operations.mention",
  "Lead converted": "notifications.platform.operations.leadConverted",
  "Lead assigned": "notifications.platform.operations.leadAssigned",
  "Lead updated": "notifications.platform.operations.leadUpdated",
  ticket_assigned: "notifications.platform.operations.ticketAssigned",
  ticket_comment: "notifications.platform.operations.ticketComment",
  ticket_status_changed: "notifications.platform.operations.ticketStatusChanged",
  ticket_priority_changed: "notifications.platform.operations.ticketPriorityChanged",
  ticket_closed: "notifications.platform.operations.ticketClosed",
  ticket_sla_warning: "notifications.platform.operations.ticketSlaWarning",
  ticket_sla_breach: "notifications.platform.operations.ticketSlaBreach",
};

function composeRichMessage(
  t: TFunction,
  kind: ComposeKind,
  params: Record<string, string>,
  title: string,
): string {
  const unknown = t("notifications.defaults.unknown");
  const noReason = t("notifications.defaults.noReason");
  const customer = hasValue(params.customerName, [unknown]) ? params.customerName : "";
  const invoice = hasValue(params.invoiceNumber, [unknown]) ? params.invoiceNumber : "";
  const amount = hasValue(params.amount, [unknown]) ? params.amount : "";
  const reason = hasValue(params.reason, [noReason]) ? params.reason : "";
  const detail = hasValue(params.detail, [t("notifications.defaults.systemDetail")]) ? params.detail : "";
  const body = params.body?.trim() ?? "";
  const usefulDetail = [detail, body].find((value) => value && !isGenericBoilerplate(value, title)) ?? "";

  if (kind === "payment") {
    const bits: string[] = [t("notifications.platform.compose.paymentReceived")];
    if (invoice) bits.push(t("notifications.platform.compose.invoicePart", { invoice }));
    if (customer) bits.push(t("notifications.platform.compose.customerPart", { customer }));
    if (amount) bits.push(t("notifications.platform.compose.amountPart", { amount }));
    if (bits.length === 1 && usefulDetail) bits.push(usefulDetail);
    return bits.join(" ");
  }

  if (kind === "invoice") {
    const bits: string[] = [t("notifications.platform.compose.invoiceCreated")];
    if (invoice) bits.push(t("notifications.platform.compose.invoicePart", { invoice }));
    if (customer) bits.push(t("notifications.platform.compose.customerPart", { customer }));
    if (amount) bits.push(t("notifications.platform.compose.amountPart", { amount }));
    if (bits.length === 1 && usefulDetail) bits.push(usefulDetail);
    return bits.join(" ");
  }

  if (kind === "appointment_cancelled") {
    const bits: string[] = [t("notifications.platform.compose.appointmentCancelled")];
    if (customer) bits.push(t("notifications.platform.compose.customerPart", { customer }));
    if (reason) bits.push(t("notifications.platform.compose.reasonPart", { reason }));
    if (bits.length === 1 && usefulDetail) bits.push(usefulDetail);
    return bits.join(" ");
  }

  if (kind === "appointment_created") {
    const bits: string[] = [t("notifications.platform.compose.appointmentCreated")];
    if (customer) bits.push(t("notifications.platform.compose.customerPart", { customer }));
    if (bits.length === 1 && usefulDetail) bits.push(usefulDetail);
    return bits.join(" ");
  }

  if (kind === "appointment_updated") {
    const bits: string[] = [t("notifications.platform.compose.appointmentUpdated")];
    if (customer) bits.push(t("notifications.platform.compose.customerPart", { customer }));
    if (bits.length === 1 && usefulDetail) bits.push(usefulDetail);
    return bits.join(" ");
  }

  if (kind === "customer") {
    return customer
      ? t("notifications.platform.templates.customerCreated.message", { name: customer })
      : usefulDetail || t("notifications.platform.compose.customerCreated");
  }

  if (kind === "system") {
    return composeSystemOperationMessage(t, params, title).message;
  }

  const bits = [customer, invoice, amount, reason, usefulDetail || detail || body].filter(Boolean);
  return bits.join(" · ");
}

function collectFactLines(params: Record<string, string>, t: TFunction): string[] {
  const unknown = t("notifications.defaults.unknown");
  const lines: string[] = [];
  if (hasValue(params.customerName, [unknown])) {
    lines.push(t("notifications.platform.compose.customerPart", { customer: params.customerName }));
  }
  if (hasValue(params.invoiceNumber, [unknown])) {
    lines.push(t("notifications.platform.compose.invoicePart", { invoice: params.invoiceNumber }));
  }
  if (hasValue(params.amount, [unknown])) {
    lines.push(t("notifications.platform.compose.amountPart", { amount: params.amount }));
  }
  if (hasValue(params.reason, [t("notifications.defaults.noReason")])) {
    lines.push(t("notifications.platform.compose.reasonPart", { reason: params.reason }));
  }
  return lines;
}

export function localizeNotification(
  t: TFunction,
  item: Pick<NotificationItem, "title_key" | "message">,
  labels?: NotificationEntityLabels,
  ctx?: NotificationLocalizeContext,
): { title: string; message: string } {
  const titleKey = resolveNotificationTitleKey(item.title_key);
  const payload = parseNotificationPayload(item.message);
  const messageKey = payload.messageKey ?? resolveLegacyMessageKey(titleKey);
  const rawParams = payload.params ?? {};

  const params = formatNotificationParams(rawParams, t, i18n.language, messageKey ?? titleKey, labels);
  const kind = resolveComposeKind(messageKey, titleKey, ctx);

  // Ensure entity ids are available for system operation enrichment.
  if (!params.bookingId && params.entityType === "booking" && params.entityId) {
    params.bookingId = params.entityId;
  }
  if (!params.taskId && params.entityType === "task" && params.entityId) {
    params.taskId = params.entityId;
  }
  if (!params.leadId && params.entityType === "lead" && params.entityId) {
    params.leadId = params.entityId;
  }

  let title: string;
  if (titleKey.startsWith("notifications.") && i18n.exists(titleKey)) {
    title = fillPlaceholders(t(titleKey, params), params).trim() || item.title_key;
  } else if (LEGACY_TITLE_KEYS[item.title_key] && i18n.exists(LEGACY_TITLE_KEYS[item.title_key])) {
    title = fillPlaceholders(t(LEGACY_TITLE_KEYS[item.title_key], params), params).trim() || item.title_key;
  } else if (i18n.exists(titleKey)) {
    title = fillPlaceholders(t(titleKey, params), params).trim() || item.title_key;
  } else {
    title = item.title_key;
  }

  if (kind === "system") {
    const system = composeSystemOperationMessage(t, params, title);
    return {
      title: system.title,
      message: system.message,
    };
  }

  let message = composeRichMessage(t, kind, params, title).trim();

  // If we only got a verb/title with no facts, append every resolved fact we have.
  const facts = collectFactLines(params, t);
  if (facts.length > 0 && (!message || message === title || isGenericBoilerplate(message, title) || messageHasUnknownTokens(message, t))) {
    message = [message && message !== title ? message : title, ...facts]
      .filter(Boolean)
      .filter((part, index, arr) => arr.indexOf(part) === index)
      .join(" — ");
  }

  if (!message || message === title || isGenericBoilerplate(message, title)) {
    const detail = params.detail?.trim() || params.body?.trim() || "";
    if (detail && !isGenericBoilerplate(detail, title)) {
      message = detail;
    } else if (facts.length > 0) {
      message = [title, ...facts].join(" — ");
    } else if (detail) {
      message = detail;
    } else if (!message) {
      message = title;
    }
  }

  if (hasUnfilledPlaceholders(message)) {
    message = fillPlaceholders(message, params).trim() || title;
  }

  return { title, message };
}

function messageHasUnknownTokens(message: string, t: TFunction): boolean {
  const unknown = t("notifications.defaults.unknown");
  const noReason = t("notifications.defaults.noReason");
  return (
    message.includes(unknown) ||
    message.includes(noReason) ||
    /غير معروف/.test(message) ||
    /\bUnknown\b/i.test(message)
  );
}
