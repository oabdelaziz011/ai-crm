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
  const normalized = readOptionalString(value)?.toLowerCase();
  if (!normalized) return fallback;
  if (!PRIORITIES.includes(normalized as TicketPriority)) {
    throw new Error(`Priority must be one of: ${PRIORITIES.join(", ")}.`);
  }
  return normalized as TicketPriority;
}

function readStatus(value: unknown): TicketStatus {
  const normalized = readRequiredString(value, "Status").toLowerCase();
  if (!STATUSES.includes(normalized as TicketStatus)) {
    throw new Error(`Status must be one of: ${STATUSES.join(", ")}.`);
  }
  return normalized as TicketStatus;
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
      const result = await ports.createTicket({
        companyId: context.companyId,
        userId,
        subject: readRequiredString(input.subject, "Subject"),
        description: readOptionalString(input.description),
        priority: readPriority(input.priority),
        customerId: readOptionalString(input.customerId),
        conversationId: readOptionalString(input.conversationId) ?? context.conversationId,
      });
      const ticket = mapTicket(result.ticket);
      return { success: true, ticketId: ticket.id, ticketNumber: ticket.ticketNumber, ticket };
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
      const subject = readOptionalString(input.subject);
      const description = readOptionalString(input.description);
      if (!subject && !description) {
        return { success: false, errorCode: "VALIDATION_ERROR", message: "Provide subject or description to update." };
      }
      const result = await ports.updateTicket({
        companyId: context.companyId,
        userId,
        ticketId,
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
      const statusRaw = readOptionalString(input.status)?.toLowerCase();
      const status = statusRaw === "resolved" || statusRaw === "closed" ? statusRaw : "closed";
      const result = await ports.closeTicket({
        companyId: context.companyId,
        userId,
        ticketId: readRequiredString(input.ticketId, "Ticket ID"),
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
        ticketId: readRequiredString(input.ticketId, "Ticket ID"),
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
      const result = await ports.addTicketComment({
        companyId: context.companyId,
        userId,
        ticketId: readRequiredString(input.ticketId, "Ticket ID"),
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
      const result = await ports.changeTicketPriority({
        companyId: context.companyId,
        userId,
        ticketId: readRequiredString(input.ticketId, "Ticket ID"),
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
      const result = await ports.changeTicketStatus({
        companyId: context.companyId,
        userId,
        ticketId: readRequiredString(input.ticketId, "Ticket ID"),
        status: readStatus(input.status),
      });
      const ticket = mapTicket(result.ticket);
      return { success: true, ticketId: ticket.id, status: ticket.status, ticket };
    },
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
      const limit = typeof input.limit === "number" ? Math.min(Math.max(input.limit, 1), 50) : 20;
      const result = await ports.searchTickets({
        companyId: context.companyId,
        userId,
        query: readOptionalString(input.query),
        status: input.status != null ? readStatus(input.status) : undefined,
        priority: input.priority != null ? readPriority(input.priority) : undefined,
        assigneeName: readOptionalString(input.assigneeName),
        customerId: readOptionalString(input.customerId),
        limit,
      });
      return {
        success: true,
        total: result.total,
        tickets: result.tickets.map(mapTicket),
        results: result.tickets.map(mapTicket),
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
