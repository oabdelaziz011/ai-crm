import type { LlmFunctionToolDefinition } from "../llm-tool-catalog.js";

export const CREATE_TICKET_TOOL_KEY = "create_ticket" as const;
export const UPDATE_TICKET_TOOL_KEY = "update_ticket" as const;
export const CLOSE_TICKET_TOOL_KEY = "close_ticket" as const;
export const ASSIGN_TICKET_TOOL_KEY = "assign_ticket" as const;
export const ADD_TICKET_COMMENT_TOOL_KEY = "add_ticket_comment" as const;
export const CHANGE_TICKET_PRIORITY_TOOL_KEY = "change_ticket_priority" as const;
export const CHANGE_TICKET_STATUS_TOOL_KEY = "change_ticket_status" as const;
export const SEARCH_TICKET_TOOL_KEY = "search_ticket" as const;

export const TICKET_TOOL_KEYS = [
  CREATE_TICKET_TOOL_KEY,
  UPDATE_TICKET_TOOL_KEY,
  CLOSE_TICKET_TOOL_KEY,
  ASSIGN_TICKET_TOOL_KEY,
  ADD_TICKET_COMMENT_TOOL_KEY,
  CHANGE_TICKET_PRIORITY_TOOL_KEY,
  CHANGE_TICKET_STATUS_TOOL_KEY,
  SEARCH_TICKET_TOOL_KEY,
] as const;

export type TicketToolKey = (typeof TICKET_TOOL_KEYS)[number];

export const CREATE_TICKET_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: CREATE_TICKET_TOOL_KEY,
    description:
      "Create a new support ticket. Use when the user reports an issue or asks to open a ticket. Example: Create a high priority ticket about billing.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Short ticket subject line" },
        description: { type: "string", description: "Detailed issue description" },
        priority: {
          type: "string",
          description: "Ticket priority: low, normal, high, or urgent",
          enum: ["low", "normal", "high", "urgent"],
        },
        customerId: { type: "string", description: "Optional CRM customer UUID" },
        conversationId: { type: "string", description: "Optional linked conversation UUID" },
      },
      required: ["subject"],
      additionalProperties: false,
    },
  },
};

export const UPDATE_TICKET_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: UPDATE_TICKET_TOOL_KEY,
    description: "Update subject or description on an existing support ticket.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Support ticket UUID" },
        subject: { type: "string", description: "Updated subject" },
        description: { type: "string", description: "Updated description" },
      },
      required: ["ticketId"],
      additionalProperties: false,
    },
  },
};

export const CLOSE_TICKET_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: CLOSE_TICKET_TOOL_KEY,
    description:
      "Close or resolve a support ticket. Example: Close ticket after the issue is fixed.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Support ticket UUID" },
        resolutionNote: { type: "string", description: "Optional resolution summary" },
        status: {
          type: "string",
          description: "Target closed state: resolved or closed",
          enum: ["resolved", "closed"],
        },
      },
      required: ["ticketId"],
      additionalProperties: false,
    },
  },
};

export const ASSIGN_TICKET_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: ASSIGN_TICKET_TOOL_KEY,
    description:
      "Assign a support ticket to a human agent by name or user id. Example: Assign ticket to Ahmed.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Support ticket UUID" },
        assigneeUserId: { type: "string", description: "Agent user UUID" },
        assigneeName: { type: "string", description: "Agent display name to resolve (e.g. Ahmed)" },
      },
      required: ["ticketId"],
      additionalProperties: false,
    },
  },
};

export const ADD_TICKET_COMMENT_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: ADD_TICKET_COMMENT_TOOL_KEY,
    description:
      "Add a comment to a ticket. Set isInternal true for internal agent notes. Example: Add internal note.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Support ticket UUID" },
        body: { type: "string", description: "Comment text" },
        isInternal: { type: "boolean", description: "When true, visible to agents only" },
      },
      required: ["ticketId", "body"],
      additionalProperties: false,
    },
  },
};

export const CHANGE_TICKET_PRIORITY_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: CHANGE_TICKET_PRIORITY_TOOL_KEY,
    description: "Change ticket priority to low, normal, high, or urgent.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Support ticket UUID" },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
        },
      },
      required: ["ticketId", "priority"],
      additionalProperties: false,
    },
  },
};

export const CHANGE_TICKET_STATUS_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: CHANGE_TICKET_STATUS_TOOL_KEY,
    description: "Change ticket workflow status.",
    parameters: {
      type: "object",
      properties: {
        ticketId: { type: "string", description: "Support ticket UUID" },
        status: {
          type: "string",
          enum: ["open", "in_progress", "waiting_customer", "resolved", "closed"],
        },
      },
      required: ["ticketId", "status"],
      additionalProperties: false,
    },
  },
};

export const SEARCH_TICKET_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: SEARCH_TICKET_TOOL_KEY,
    description: "Search support tickets by keyword, status, priority, assignee name, or customer.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search subject, number, or description" },
        status: {
          type: "string",
          enum: ["open", "in_progress", "waiting_customer", "resolved", "closed"],
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
        },
        assigneeName: { type: "string", description: "Filter by assignee display name" },
        customerId: { type: "string", description: "Filter by customer UUID" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
      additionalProperties: false,
    },
  },
};

export const TICKET_TOOL_EXAMPLES: Record<TicketToolKey, string[]> = {
  create_ticket: ['Create a high priority ticket for "Payment failed on checkout".'],
  update_ticket: ['Update ticket subject to "Billing escalation".'],
  close_ticket: ["Close ticket after customer confirmed resolution."],
  assign_ticket: ["Assign ticket to Ahmed."],
  add_ticket_comment: ["Add internal note: escalated to billing team."],
  change_ticket_priority: ["Set ticket priority to urgent."],
  change_ticket_status: ["Move ticket to in_progress."],
  search_ticket: ['Search tickets assigned to Ahmed with status open.'],
};
