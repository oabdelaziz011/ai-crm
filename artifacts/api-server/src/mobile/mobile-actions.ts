/**
 * Pure authorization and validation for native record actions.
 * The company id is the one resolved from X-ValueOR-Instance. A different
 * company id in the body is rejected and is not copied into the action.
 */

export const TICKET_STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const CONVERSATION_STATES = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "completed",
  "cancelled",
  "transferred_to_human",
  "closed",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BRANCH_CODE = /^[A-Za-z0-9_-]{1,32}$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type WeeklyHour = {
  day_of_week: number;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
};

export type MobileRecordAction =
  | { type: "customer.create"; name: string; email: string | null; phone: string | null }
  | { type: "customer.update"; id: string; name: string; phone: string | null }
  | { type: "lead.create"; title: string; email: string | null; phone: string | null }
  | { type: "lead.update"; id: string; title: string }
  | { type: "opportunity.create"; name: string; currency: string }
  | { type: "opportunity.update"; id: string; name: string }
  | { type: "ticket.status"; id: string; status: (typeof TICKET_STATUSES)[number] }
  | { type: "ticket.priority"; id: string; priority: (typeof TICKET_PRIORITIES)[number] }
  | { type: "ticket.assign"; id: string; assignedUserId: string }
  | { type: "ticket.note"; id: string; body: string }
  | { type: "ticket.reply"; id: string; body: string }
  | { type: "conversation.assign"; id: string; assignedUserId: string }
  | { type: "conversation.state"; id: string; state: (typeof CONVERSATION_STATES)[number] }
  | { type: "conversation.read"; id: string }
  | { type: "conversation.unread"; id: string }
  | { type: "conversation.send"; id: string; text: string }
  | { type: "notification.read"; id: string }
  | { type: "notification.read_all" }
  | { type: "branch.create"; name: string; code: string; timezone: string; city: string | null; phone: string | null }
  | { type: "branch.update"; id: string; name: string; code: string; timezone: string }
  | { type: "branch.hours"; id: string; weeklyHours: WeeklyHour[] }
  | { type: "role.update"; id: string; name: string }
  | { type: "email.draft"; id: string; subject: string; body: string; mode: "compose" | "reply" | "forward" };

export type MobileActionDecision =
  | { ok: true; companyId: string; action: MobileRecordAction }
  | { ok: false; status: number; code: string; message: string };

const PERMISSION: Record<MobileRecordAction["type"], string | null> = {
  "customer.create": "customers.create",
  "customer.update": "customers.edit",
  "lead.create": "leads.create",
  "lead.update": "leads.edit",
  "opportunity.create": "opportunities.create",
  "opportunity.update": "opportunities.edit",
  "ticket.status": "tickets.edit",
  "ticket.priority": "tickets.edit",
  "ticket.assign": "tickets.assign",
  "ticket.note": "tickets.comment",
  "ticket.reply": "tickets.comment",
  "conversation.assign": "ai.conversations.takeover",
  "conversation.state": "ai.conversations.reply",
  "conversation.read": "ai.conversations.view",
  "conversation.unread": "ai.conversations.view",
  "conversation.send": "ai.conversations.reply",
  "notification.read": null,
  "notification.read_all": null,
  "branch.create": "settings.edit",
  "branch.update": "settings.edit",
  "branch.hours": "settings.edit",
  "role.update": "roles.edit",
  "email.draft": "email.view",
};

function deny(status: number, code: string, message: string): MobileActionDecision {
  return { ok: false, status, code, message };
}

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optional(value: unknown): string | null {
  const next = text(value);
  return next || null;
}

function id(value: unknown): string | null {
  const next = text(value, 80);
  return UUID.test(next) ? next : null;
}

function allowed(permissions: string[], isSuperAdmin: boolean, code: string | null): boolean {
  if (code == null) return true;
  return isSuperAdmin || permissions.includes(code);
}

function hours(value: unknown): WeeklyHour[] | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  const days: WeeklyHour[] = [];
  for (let index = 0; index < 7; index += 1) {
    const row = value[index];
    if (!row || typeof row !== "object") return null;
    const day = row as Record<string, unknown>;
    if (Number(day.day_of_week) !== index) return null;
    const closed = day.is_closed === true;
    const opens = optional(day.opens_at);
    const closes = optional(day.closes_at);
    if (!closed && (!opens || !closes || !TIME.test(opens) || !TIME.test(closes) || opens >= closes)) return null;
    days.push({ day_of_week: index, is_closed: closed, opens_at: closed ? null : opens, closes_at: closed ? null : closes });
  }
  return days;
}

export function decideMobileAction(input: {
  scope: "platform" | "tenant";
  companyId: string | null;
  isSuperAdmin: boolean;
  permissions: string[];
  body: unknown;
}): MobileActionDecision {
  if (input.scope !== "tenant" || !input.companyId) {
    return deny(403, "tenant_required", "A company workspace is required.");
  }
  const body = input.body && typeof input.body === "object" ? input.body as Record<string, unknown> : {};
  const claimed = optional(body.companyId);
  if (claimed && claimed !== input.companyId) {
    return deny(403, "cross_tenant", "Access denied for this company.");
  }
  const type = text(body.type, 80);
  if (!(type in PERMISSION)) return deny(400, "validation_error", "This action is not supported.");
  const actionType = type as MobileRecordAction["type"];
  if (actionType === "conversation.read" || actionType === "conversation.unread") {
    const canRead = input.isSuperAdmin
      || input.permissions.includes("ai.conversations.view")
      || input.permissions.includes("ai.conversations.view_assigned");
    if (!canRead) return deny(403, "forbidden", "Permission denied.");
  } else if (!allowed(input.permissions, input.isSuperAdmin, PERMISSION[actionType])) {
    return deny(403, "forbidden", "Permission denied.");
  }

  const recordId = id(body.id);
  if (actionType === "customer.create") {
    const name = text(body.name, 200);
    if (!name) return deny(400, "validation_error", "Name is required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, name, email: optional(body.email), phone: optional(body.phone) } };
  }
  if (actionType === "customer.update") {
    const name = text(body.name, 200);
    if (!recordId || !name) return deny(400, "validation_error", "A customer id and name are required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, name, phone: optional(body.phone) } };
  }
  if (actionType === "lead.create") {
    const title = text(body.title, 200);
    if (!title) return deny(400, "validation_error", "Title is required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, title, email: optional(body.email), phone: optional(body.phone) } };
  }
  if (actionType === "lead.update") {
    const title = text(body.title, 200);
    if (!recordId || !title) return deny(400, "validation_error", "A lead id and title are required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, title } };
  }
  if (actionType === "opportunity.create") {
    const name = text(body.name, 200);
    const currency = text(body.currency, 3).toUpperCase();
    if (!name || !CURRENCY.test(currency)) return deny(400, "validation_error", "Name and a three-letter currency are required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, name, currency } };
  }
  if (actionType === "opportunity.update") {
    const name = text(body.name, 200);
    if (!recordId || !name) return deny(400, "validation_error", "An opportunity id and name are required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, name } };
  }
  if (actionType === "ticket.status") {
    const status = text(body.status, 40);
    if (!recordId || !TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) {
      return deny(400, "validation_error", "A valid ticket status is required.");
    }
    if ((status === "closed" || status === "resolved") && !allowed(input.permissions, input.isSuperAdmin, "tickets.close")) {
      return deny(403, "forbidden", "Permission denied.");
    }
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, status: status as (typeof TICKET_STATUSES)[number] } };
  }
  if (actionType === "ticket.priority") {
    const priority = text(body.priority, 40);
    if (!recordId || !TICKET_PRIORITIES.includes(priority as (typeof TICKET_PRIORITIES)[number])) {
      return deny(400, "validation_error", "A valid ticket priority is required.");
    }
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, priority: priority as (typeof TICKET_PRIORITIES)[number] } };
  }
  if (actionType === "ticket.assign" || actionType === "conversation.assign") {
    const assignedUserId = id(body.assignedUserId);
    if (!recordId || !assignedUserId) return deny(400, "validation_error", "A record id and assignee are required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, assignedUserId } };
  }
  if (actionType === "ticket.note" || actionType === "ticket.reply") {
    const note = text(body.body, 5000);
    if (!recordId || !note) return deny(400, "validation_error", "A ticket id and message are required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, body: note } };
  }
  if (actionType === "conversation.state") {
    const state = text(body.state, 40);
    if (!recordId || !CONVERSATION_STATES.includes(state as (typeof CONVERSATION_STATES)[number])) {
      return deny(400, "validation_error", "A valid conversation state is required.");
    }
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, state: state as (typeof CONVERSATION_STATES)[number] } };
  }
  if (actionType === "conversation.read" || actionType === "conversation.unread" || actionType === "notification.read") {
    if (!recordId) return deny(400, "validation_error", "A record id is required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId } };
  }
  if (actionType === "conversation.send") {
    const message = text(body.text, 5000);
    if (!recordId || !message) return deny(400, "validation_error", "A conversation id and message are required.");
    if (body.confirmSend !== true) return deny(400, "confirmation_required", "Confirm the message before it can be sent.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, text: message } };
  }
  if (actionType === "notification.read_all") {
    return { ok: true, companyId: input.companyId, action: { type: actionType } };
  }
  if (actionType === "branch.create" || actionType === "branch.update") {
    const name = text(body.name, 200);
    const code = text(body.code, 32);
    const timezone = text(body.timezone, 80);
    if (!name || !BRANCH_CODE.test(code) || !timezone) {
      return deny(400, "validation_error", "Branch name, code, and timezone are required.");
    }
    if (actionType === "branch.update") {
      if (!recordId) return deny(400, "validation_error", "A branch id is required.");
      return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, name, code, timezone } };
    }
    return { ok: true, companyId: input.companyId, action: { type: actionType, name, code, timezone, city: optional(body.city), phone: optional(body.phone) } };
  }
  if (actionType === "branch.hours") {
    const weeklyHours = hours(body.weeklyHours);
    if (!recordId || !weeklyHours) return deny(400, "validation_error", "A seven-day schedule is required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, weeklyHours } };
  }
  if (actionType === "role.update") {
    const name = text(body.name, 120);
    if (!recordId || !name) return deny(400, "validation_error", "A role id and name are required.");
    return { ok: true, companyId: input.companyId, action: { type: actionType, id: recordId, name } };
  }
  const subject = text(body.subject, 200);
  const draft = text(body.body, 20000);
  const mode = text(body.mode, 20);
  if (!recordId || !draft || (mode !== "compose" && mode !== "reply" && mode !== "forward")) {
    return deny(400, "validation_error", "An email conversation, body, and mode are required.");
  }
  return { ok: true, companyId: input.companyId, action: { type: "email.draft", id: recordId, subject, body: draft, mode } };
}
