import { readConversationLanguage, type ConversationLanguage } from "./conversation-language.js";

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBookingRecord(variables: Record<string, unknown>): Record<string, unknown> | null {
  const booking = variables.booking;
  if (!booking || typeof booking !== "object" || Array.isArray(booking)) return null;
  return booking as Record<string, unknown>;
}

function readNodeAction(node: { type: string; config?: Record<string, unknown> }): string | null {
  if (node.type !== "action") return null;
  const action = node.config?.action;
  return typeof action === "string" && action.trim() ? action.trim() : null;
}

/**
 * Queue a default confirmation unless the next node already sends a custom message.
 * Follow-up buttons such as “anything else?” do not count as confirmation copy.
 */
export function shouldQueueDefaultBookingConfirmation(input: {
  currentNodeId: string;
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>;
  edges: Array<{ source_node_id: string; target_node_id: string }>;
}): boolean {
  const outgoing = input.edges.filter((edge) => edge.source_node_id === input.currentNodeId);
  if (outgoing.length === 0) return true;

  const byId = new Map(input.nodes.map((node) => [node.id, node]));
  const nextNodes = outgoing
    .map((edge) => byId.get(edge.target_node_id))
    .filter((node): node is { id: string; type: string; config?: Record<string, unknown> } => Boolean(node));

  if (nextNodes.length === 0) return true;
  return !nextNodes.some((node) => readNodeAction(node) === "send_message");
}

export function resolveBookingConfirmationLanguage(
  variables: Record<string, unknown>,
): ConversationLanguage {
  return readConversationLanguage(variables) ?? "ar";
}

export function formatBookingConfirmationMessage(input: {
  language: ConversationLanguage;
  customerName?: string | null;
  serviceName?: string | null;
  resourceName?: string | null;
  displayDate?: string | null;
  displayTime?: string | null;
  confirmationCode: string;
}): string | null {
  const confirmationCode = input.confirmationCode.trim();
  if (!confirmationCode) return null;

  const customerName = input.customerName?.trim() || null;
  const serviceName = input.serviceName?.trim() || null;
  const resourceName = input.resourceName?.trim() || null;
  const displayDate = input.displayDate?.trim() || null;
  const displayTime = input.displayTime?.trim() || null;
  const isArabic = input.language === "ar";

  const lines: string[] = [];
  if (isArabic) {
    lines.push(customerName ? `تم حجز موعدك بنجاح يا ${customerName} ✅` : "تم حجز موعدك بنجاح ✅");
    if (serviceName) lines.push(`الخدمة: ${serviceName}`);
    if (resourceName) lines.push(`مع: ${resourceName}`);
    if (displayDate) lines.push(`اليوم: ${displayDate}`);
    if (displayTime) lines.push(`الساعة: ${displayTime}`);
    lines.push(`رقم الحجز: ${confirmationCode}`);
  } else {
    lines.push(customerName ? `Your appointment is booked, ${customerName} ✅` : "Your appointment is booked ✅");
    if (serviceName) lines.push(`Service: ${serviceName}`);
    if (resourceName) lines.push(`With: ${resourceName}`);
    if (displayDate) lines.push(`Date: ${displayDate}`);
    if (displayTime) lines.push(`Time: ${displayTime}`);
    lines.push(`Booking number: ${confirmationCode}`);
  }

  return lines.join("\n");
}

export function buildDefaultBookingConfirmationText(
  variables: Record<string, unknown>,
): string | null {
  const booking = readBookingRecord(variables);
  if (!booking) return null;

  const confirmationCode =
    readTrimmedString(booking.confirmation_code) ?? readTrimmedString(booking.confirmation_number);
  if (!confirmationCode) return null;

  return formatBookingConfirmationMessage({
    language: resolveBookingConfirmationLanguage(variables),
    customerName: readTrimmedString(booking.customer_name),
    serviceName: readTrimmedString(booking.service_name) ?? readTrimmedString(booking.service),
    resourceName: readTrimmedString(booking.resource_name) ?? readTrimmedString(booking.doctor_name),
    displayDate: readTrimmedString(booking.display_date) ?? readTrimmedString(booking.date),
    displayTime: readTrimmedString(booking.display_time) ?? readTrimmedString(booking.time),
    confirmationCode,
  });
}
