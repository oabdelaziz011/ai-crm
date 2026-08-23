import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { TicketAgentToolPorts, TicketPriority, TicketStatus } from "./ticket-agent-ports.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

const ACTIVE_STATES: ConversationState[] = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "transferred_to_human",
];

const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];
const STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];

/** Safe model-facing copy — do not reveal whether another customer's ticket exists. */
export const TICKET_CUSTOMER_CONTEXT_REQUIRED_MESSAGE =
  "يجب تحديد العميل في هذه المحادثة أولاً قبل التعامل مع التذاكر.";

export const TICKET_CUSTOMER_OWNERSHIP_DENIED_MESSAGE = "هذه التذكرة غير متاحة لهذا العميل.";

/** Open-ish statuses used when surfacing the latest open ticket number to the customer. */
const OPENISH_TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_customer"];

function isOpenishTicketStatus(status: string): boolean {
  return OPENISH_TICKET_STATUSES.includes(status as TicketStatus);
}

function requireUser(context: ToolExecutionContext): string {
  if (!context.userId?.trim()) {
    throw new Error("An authenticated user is required for ticket operations.");
  }
  return context.userId;
}

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function readOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = typeof value === "string" ? value.trim() : String(value).trim();
  return normalized || undefined;
}

function readPriority(value: unknown, fallback: TicketPriority = "normal"): TicketPriority {
  const raw = readOptionalString(value);
  if (!raw) return fallback;
  const normalized = normalizeTicketPriorityAlias(raw);
  if (!PRIORITIES.includes(normalized as TicketPriority)) {
    throw new Error(`Priority must be one of: ${PRIORITIES.join(", ")}.`);
  }
  return normalized as TicketPriority;
}

function normalizeTicketPriorityAlias(value: string): string {
  const key = value.trim().toLowerCase();
  const aliases: Record<string, TicketPriority> = {
    low: "low",
    منخفضة: "low",
    منخفض: "low",
    normal: "normal",
    عادية: "normal",
    عادي: "normal",
    متوسطة: "normal",
    متوسط: "normal",
    high: "high",
    عالية: "high",
    عالي: "high",
    مرتفعة: "high",
    مرتفع: "high",
    urgent: "urgent",
    عاجلة: "urgent",
    عاجل: "urgent",
  };
  return aliases[key] ?? key;
}

function readStatus(value: unknown): TicketStatus {
  const normalized = normalizeTicketStatusAlias(readRequiredString(value, "Status"));
  if (!STATUSES.includes(normalized as TicketStatus)) {
    throw new Error(`Status must be one of: ${STATUSES.join(", ")}.`);
  }
  return normalized as TicketStatus;
}

function normalizeTicketStatusAlias(value: string): string {
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  const spaced = value.trim().toLowerCase();
  const aliases: Record<string, TicketStatus> = {
    open: "open",
    مفتوحة: "open",
    مفتوح: "open",
    in_progress: "in_progress",
    "in-progress": "in_progress",
    قيد_المعالجة: "in_progress",
    "قيد المعالجة": "in_progress",
    معالجة: "in_progress",
    waiting_customer: "waiting_customer",
    "waiting-customer": "waiting_customer",
    بانتظار_العميل: "waiting_customer",
    "بانتظار العميل": "waiting_customer",
    resolved: "resolved",
    محلولة: "resolved",
    محلول: "resolved",
    closed: "closed",
    مغلقة: "closed",
    مغلق: "closed",
  };
  return aliases[key] ?? aliases[spaced] ?? key;
}

function mapTicket(ticket: Awaited<ReturnType<TicketAgentToolPorts["createTicket"]>>["ticket"]) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    customerId: ticket.customerId,
    conversationId: ticket.conversationId,
    assignedUserId: ticket.assignedUserId,
    assignedUserName: ticket.assignedUserName,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
  };
}

function customerContextRequiredResult() {
  return {
    success: false as const,
    errorCode: "CUSTOMER_CONTEXT_REQUIRED",
    errors: ["CUSTOMER_CONTEXT_REQUIRED"],
    message: TICKET_CUSTOMER_CONTEXT_REQUIRED_MESSAGE,
  };
}

function customerOwnershipDeniedResult() {
  return {
    success: false as const,
    errorCode: "CUSTOMER_OWNERSHIP_DENIED",
    errors: ["CUSTOMER_OWNERSHIP_DENIED"],
    message: TICKET_CUSTOMER_OWNERSHIP_DENIED_MESSAGE,
  };
}

/**
 * AI Employee channel execution must use conversation.customer_id only.
 * LLM-supplied customerId must never override this.
 */
function requireTrustedCustomerId(
  context: ToolExecutionContext,
): { ok: true; trustedCustomerId: string } | { ok: false; result: ReturnType<typeof customerContextRequiredResult> } {
  const trusted = typeof context.trustedCustomerId === "string" ? context.trustedCustomerId.trim() : "";
  if (!trusted) {
    return { ok: false, result: customerContextRequiredResult() };
  }
  return { ok: true, trustedCustomerId: trusted };
}

/**
 * Resolve ticket under trusted company, then require ticket.customer_id === trustedCustomerId.
 * Missing ticket / wrong customer / null customer → same safe denial (no leak).
 */
async function requireOwnedTicket(
  ports: TicketAgentToolPorts,
  context: ToolExecutionContext,
  userId: string,
  ticketIdRaw: string,
): Promise<
  | { ok: true; trustedCustomerId: string; ticketId: string }
  | {
      ok: false;
      result: ReturnType<typeof customerContextRequiredResult> | ReturnType<typeof customerOwnershipDeniedResult>;
    }
> {
  const customer = requireTrustedCustomerId(context);
  if (!customer.ok) return customer;

  let ticketId = ticketIdRaw.trim();
  if (/^TKT-/i.test(ticketId) || /^\d{5,8}$/.test(ticketId)) {
    const query = normalizeTicketNumberQuery(ticketId);
    const listed = await ports.searchTickets({
      companyId: context.companyId,
      userId,
      query,
      customerId: customer.trustedCustomerId,
      limit: 5,
    });
    const match =
      listed.tickets.find((ticket) => ticketNumbersMatch(String(ticket.ticketNumber ?? ""), query)) ??
      null;
    if (!match) return { ok: false, result: customerOwnershipDeniedResult() };
    ticketId = match.id;
  }

  let ticketCustomerId: string | null | undefined;
  try {
    const found = await ports.getTicket({
      companyId: context.companyId,
      userId,
      ticketId,
    });
    ticketCustomerId = found?.ticket.customerId;
  } catch {
    return { ok: false, result: customerOwnershipDeniedResult() };
  }

  if (!ticketCustomerId || ticketCustomerId !== customer.trustedCustomerId) {
    return { ok: false, result: customerOwnershipDeniedResult() };
  }

  return { ok: true, trustedCustomerId: customer.trustedCustomerId, ticketId };
}

function createCreateTicketTool(ports: TicketAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            subject: { type: "string", minLength: 1 },
            description: { type: "string" },
            priority: { type: "string" },
            customerId: { type: "string" },
            conversationId: { type: "string" },
          },
          required: ["subject"],
        },
        input,
      );
      readPriority(input.priority);
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const customer = requireTrustedCustomerId(context);
      if (!customer.ok) return customer.result;

      // Always create a new ticket when the customer files a complaint — even if similar/open ones exist.
      // Force trusted conversation customer — ignore LLM customerId.
      const result = await ports.createTicket({
        companyId: context.companyId,
        userId,
        subject: readRequiredString(input.subject, "Subject"),
        description: readOptionalString(input.description),
        priority: readPriority(input.priority),
        customerId: customer.trustedCustomerId,
        conversationId: readOptionalString(input.conversationId) ?? context.conversationId,
      });
      const ticket = mapTicket(result.ticket);
      return {
        success: true,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        ticket,
        message: `Ticket created. Tell the customer the exact ticketNumber ${ticket.ticketNumber}.`,
      };
    },
  };
}

function createUpdateTicketTool(ports: TicketAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            subject: { type: "string" },
            description: { type: "string" },
          },
          required: ["ticketId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const ticketId = readRequiredString(input.ticketId, "Ticket ID");
      const owned = await requireOwnedTicket(ports, context, userId, ticketId);
      if (!owned.ok) return owned.result;

      const subject = readOptionalString(input.subject);
      const description = readOptionalString(input.description);
      if (!subject && !description) {
        return { success: false, errorCode: "VALIDATION_ERROR", message: "Provide subject or description to update." };
      }
      const result = await ports.updateTicket({
        companyId: context.companyId,
        userId,
        ticketId: owned.ticketId,
        subject,
        description,
      });
      const ticket = mapTicket(result.ticket);
      return { success: true, ticketId: ticket.id, ticket };
    },
  };
}

function createCloseTicketTool(ports: TicketAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            resolutionNote: { type: "string" },
            status: { type: "string" },
          },
          required: ["ticketId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const ticketId = readRequiredString(input.ticketId, "Ticket ID");
      const owned = await requireOwnedTicket(ports, context, userId, ticketId);
      if (!owned.ok) return owned.result;

      let existingStatus: string | null = null;
      try {
        const found = await ports.getTicket({
          companyId: context.companyId,
          userId,
          ticketId: owned.ticketId,
        });
        existingStatus = found?.ticket.status ?? null;
      } catch {
        return customerOwnershipDeniedResult();
      }
      if (existingStatus === "closed" || existingStatus === "resolved") {
        return {
          success: false,
          errorCode: "TICKET_ALREADY_CLOSED",
          errors: ["TICKET_ALREADY_CLOSED"],
          message: "هذه التذكرة مغلقة بالفعل ولا يمكن إغلاقها مرة أخرى.",
          status: existingStatus,
        };
      }

      const statusRaw = readOptionalString(input.status)?.toLowerCase();
      const status = statusRaw === "resolved" || statusRaw === "closed" ? statusRaw : "closed";
      const result = await ports.closeTicket({
        companyId: context.companyId,
        userId,
        ticketId: owned.ticketId,
        resolutionNote: readOptionalString(input.resolutionNote),
        status,
      });
      const ticket = mapTicket(result.ticket);
      return { success: true, ticketId: ticket.id, status: ticket.status, ticket };
    },
  };
}

function createAssignTicketTool(ports: TicketAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            assigneeUserId: { type: "string" },
            assigneeName: { type: "string" },
          },
          required: ["ticketId"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const ticketId = readRequiredString(input.ticketId, "Ticket ID");
      const owned = await requireOwnedTicket(ports, context, userId, ticketId);
      if (!owned.ok) return owned.result;

      const assigneeUserId = readOptionalString(input.assigneeUserId);
      const assigneeName = readOptionalString(input.assigneeName);
      if (!assigneeUserId && !assigneeName) {
        return {
          success: false,
          errorCode: "VALIDATION_ERROR",
          message: "Provide assigneeUserId or assigneeName.",
        };
      }
      const result = await ports.assignTicket({
        companyId: context.companyId,
        userId,
        ticketId: owned.ticketId,
        assigneeUserId,
        assigneeName,
      });
      const ticket = mapTicket(result.ticket);
      return {
        success: true,
        ticketId: ticket.id,
        assignedUserId: ticket.assignedUserId,
        assignedUserName: ticket.assignedUserName,
        ticket,
      };
    },
  };
}

function createAddTicketCommentTool(ports: TicketAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            body: { type: "string", minLength: 1 },
            isInternal: { type: "boolean" },
          },
          required: ["ticketId", "body"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const ticketId = readRequiredString(input.ticketId, "Ticket ID");
      const owned = await requireOwnedTicket(ports, context, userId, ticketId);
      if (!owned.ok) return owned.result;

      const result = await ports.addTicketComment({
        companyId: context.companyId,
        userId,
        ticketId: owned.ticketId,
        body: readRequiredString(input.body, "Comment body"),
        isInternal: input.isInternal === true,
      });
      return {
        success: true,
        commentId: result.commentId,
        ticketId: result.ticketId,
        isInternal: input.isInternal === true,
      };
    },
  };
}

function createChangeTicketPriorityTool(ports: TicketAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            priority: { type: "string" },
          },
          required: ["ticketId", "priority"],
        },
        input,
      );
      readPriority(input.priority);
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const ticketId = readRequiredString(input.ticketId, "Ticket ID");
      const owned = await requireOwnedTicket(ports, context, userId, ticketId);
      if (!owned.ok) return owned.result;

      const result = await ports.changeTicketPriority({
        companyId: context.companyId,
        userId,
        ticketId: owned.ticketId,
        priority: readPriority(input.priority),
      });
      const ticket = mapTicket(result.ticket);
      return { success: true, ticketId: ticket.id, priority: ticket.priority, ticket };
    },
  };
}

function createChangeTicketStatusTool(ports: TicketAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            ticketId: { type: "string" },
            status: { type: "string" },
          },
          required: ["ticketId", "status"],
        },
        input,
      );
      readStatus(input.status);
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const ticketId = readRequiredString(input.ticketId, "Ticket ID");
      const owned = await requireOwnedTicket(ports, context, userId, ticketId);
      if (!owned.ok) return owned.result;

      const result = await ports.changeTicketStatus({
        companyId: context.companyId,
        userId,
        ticketId: owned.ticketId,
        status: readStatus(input.status),
      });
      const ticket = mapTicket(result.ticket);
      return { success: true, ticketId: ticket.id, status: ticket.status, ticket };
    },
  };
}

function isPhoneLikeTicketQuery(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /^TKT-/i.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  // LLM often passes the WhatsApp sender phone as query; tickets are already scoped by customer.
  return /^[\d\s+\-().]+$/.test(trimmed);
}

function isTicketNumberQuery(value: string): boolean {
  const trimmed = value.trim();
  if (/^TKT-\d+$/i.test(trimmed)) return true;
  // Zero-padded numeric ticket fragment the customer may paste without the TKT- prefix.
  return /^\d{5,8}$/.test(trimmed);
}

function normalizeTicketNumberQuery(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (/^TKT-\d+$/.test(trimmed)) return trimmed;
  if (/^\d{5,8}$/.test(trimmed)) return `TKT-${trimmed}`;
  return trimmed;
}

function ticketNumbersMatch(left: string, right: string): boolean {
  const a = normalizeTicketNumberQuery(left);
  const b = normalizeTicketNumberQuery(right);
  if (a === b) return true;
  const digitsA = a.replace(/^TKT-/, "").replace(/^0+/, "") || "0";
  const digitsB = b.replace(/^TKT-/, "").replace(/^0+/, "") || "0";
  return digitsA === digitsB;
}

/** Channel-safe ticket payload — never expose subject/description to the LLM reply path. */
function mapTicketForCustomerSearch(
  ticket: Awaited<ReturnType<TicketAgentToolPorts["createTicket"]>>["ticket"],
) {
  const mapped = mapTicket(ticket);
  return {
    id: mapped.id,
    ticketNumber: mapped.ticketNumber,
    status: mapped.status,
    priority: mapped.priority,
    customerId: mapped.customerId,
    assignedUserName: mapped.assignedUserName,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
    closedAt: mapped.closedAt,
  };
}

function createSearchTicketTool(ports: TicketAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            query: { type: "string" },
            status: { type: "string" },
            priority: { type: "string" },
            assigneeName: { type: "string" },
            customerId: { type: "string" },
            limit: { type: "number" },
          },
        },
        input,
      );
      if (input.priority != null) readPriority(input.priority);
      if (input.status != null) readStatus(input.status);
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const customer = requireTrustedCustomerId(context);
      if (!customer.ok) {
        return {
          ...customer.result,
          tickets: [],
          results: [],
          total: 0,
          latestOpenTicketNumber: null,
          matchedTicketNumber: null,
        };
      }

      let query = readOptionalString(input.query);
      if (query && isPhoneLikeTicketQuery(query)) {
        return {
          success: true,
          total: 0,
          tickets: [],
          results: [],
          latestOpenTicketNumber: null,
          matchedTicketNumber: null,
          needsTicketNumber: true,
          message:
            "Ask the customer for their ticket number (e.g. TKT-000085). Do not search by phone number.",
        };
      }

      const limit = typeof input.limit === "number" ? Math.min(Math.max(input.limit, 1), 50) : 20;

      if (!query || !isTicketNumberQuery(query)) {
        const listResult = await ports.searchTickets({
          companyId: context.companyId,
          userId,
          status: input.status != null ? readStatus(input.status) : undefined,
          priority: input.priority != null ? readPriority(input.priority) : undefined,
          assigneeName: readOptionalString(input.assigneeName),
          customerId: customer.trustedCustomerId,
          limit,
        });
        const tickets = [...listResult.tickets]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map(mapTicketForCustomerSearch);
        return {
          success: true,
          total: tickets.length,
          tickets,
          results: tickets,
          matchedTicketNumber: null,
          latestOpenTicketNumber:
            tickets.find((ticket) => isOpenishTicketStatus(String(ticket.status)))?.ticketNumber ??
            null,
          message:
            tickets.length > 0
              ? "Summarize ticket numbers and status only for this customer. NEVER mention subject, topic, or description."
              : "No tickets found for this customer.",
        };
      }

      const normalizedQuery = normalizeTicketNumberQuery(query);

      // Force trusted conversation customer — ignore LLM customerId.
      const result = await ports.searchTickets({
        companyId: context.companyId,
        userId,
        query: normalizedQuery,
        status: input.status != null ? readStatus(input.status) : undefined,
        priority: input.priority != null ? readPriority(input.priority) : undefined,
        assigneeName: readOptionalString(input.assigneeName),
        customerId: customer.trustedCustomerId,
        limit,
      });
      const tickets = [...result.tickets]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(mapTicketForCustomerSearch);
      // Exact ticket-number match only — never fall back to an unrelated fuzzy hit.
      const matched =
        tickets.find((ticket) => ticketNumbersMatch(String(ticket.ticketNumber ?? ""), normalizedQuery)) ??
        null;
      if (!matched) {
        return {
          success: true,
          total: 0,
          tickets: [],
          results: [],
          matchedTicketNumber: null,
          latestOpenTicketNumber: null,
          status: null,
          message:
            "No ticket with that number was found for this customer. Ask them to confirm the ticket number. Never invent one.",
        };
      }

      return {
        success: true,
        total: 1,
        tickets: [matched],
        results: [matched],
        matchedTicketNumber: matched.ticketNumber,
        latestOpenTicketNumber: isOpenishTicketStatus(String(matched.status))
          ? matched.ticketNumber
          : null,
        status: matched.status,
        priority: matched.priority,
        createdAt: matched.createdAt,
        message: `Reply using the exact status "${matched.status}" for ticket ${matched.ticketNumber}. NEVER invent a different status. NEVER mention subject, topic, or description.`,
      };
    },
  };
}

export function createTicketAgentTools(ports: TicketAgentToolPorts): Record<string, Tool> {
  return {
    create_ticket: createCreateTicketTool(ports),
    update_ticket: createUpdateTicketTool(ports),
    close_ticket: createCloseTicketTool(ports),
    assign_ticket: createAssignTicketTool(ports),
    add_ticket_comment: createAddTicketCommentTool(ports),
    change_ticket_priority: createChangeTicketPriorityTool(ports),
    change_ticket_status: createChangeTicketStatusTool(ports),
    search_ticket: createSearchTicketTool(ports),
  };
}

export {
  CREATE_TICKET_TOOL_KEY,
  UPDATE_TICKET_TOOL_KEY,
  CLOSE_TICKET_TOOL_KEY,
  ASSIGN_TICKET_TOOL_KEY,
  ADD_TICKET_COMMENT_TOOL_KEY,
  CHANGE_TICKET_PRIORITY_TOOL_KEY,
  CHANGE_TICKET_STATUS_TOOL_KEY,
  SEARCH_TICKET_TOOL_KEY,
  TICKET_TOOL_KEYS,
} from "./ticket-tool-definitions.js";
