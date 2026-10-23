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
      "Create a new support ticket only when the customer is filing a NEW complaint and has already provided the complaint text. Never create a ticket for status/tracking questions (use search_ticket). If the customer only says they want to complain without details, ask for the full complaint text first — do not call this tool yet. Set description to that full text and set priority from severity (low|normal|high|urgent). After success, always tell the customer the exact ticketNumber from the tool result (e.g. TKT-000012).",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "Short ticket subject line derived from the complaint" },
        description: {
          type: "string",
          description: "Required full complaint body from the customer (not just 'I want to file a complaint')",
        },
        priority: {
          type: "string",
          description: "Ticket priority derived from the complaint: low, normal (medium), high, or urgent",
          enum: ["low", "normal", "high", "urgent"],
        },
        customerId: { type: "string", description: "Optional CRM customer UUID" },
        conversationId: { type: "string", description: "Optional linked conversation UUID" },
      },
      required: ["subject", "description"],
      additionalProperties: false,
    },
  },
};

export const UPDATE_TICKET_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: UPDATE_TICKET_TOOL_KEY,
    description:
      "Update an existing support ticket. Set ONLY the field the customer asked to change. Arabic: subject/title = عنوان or موضوع (NOT وصف); description/body = وصف or تفاصيل (NOT عنوان). Never put a title/subject update into description or vice versa.",
    parameters: {
      type: "object",
      properties: {
        ticketId: {
          type: "string",
          description: "Ticket number (e.g. TKT-000093) or ticket UUID",
        },
        subject: {
          type: "string",
          description:
            "New ticket SUBJECT/title ONLY when the customer asks to update عنوان or موضوع. Do NOT use for وصف/تفاصيل.",
        },
        description: {
          type: "string",
          description:
            "New ticket DESCRIPTION/body ONLY when the customer asks to update وصف or تفاصيل. Do NOT use for عنوان/موضوع.",
        },
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
      "Add a comment to an EXISTING ticket. Arabic: أضف تعليق / ضيف تعليق / اضيف شكوى (add onto existing — NOT create). If multiple open tickets, ask which ticket number first; if one, confirm the number then ask for the comment body. After success, confirm the comment was added on that ticket number. Set isInternal true for internal agent notes only.",
    parameters: {
      type: "object",
      properties: {
        ticketId: {
          type: "string",
          description: "Ticket number (e.g. TKT-000093) or ticket UUID",
        },
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
    description:
      "Change ticket priority to low, normal, high, or urgent. Arabic: خليها عاجلة / أولوية عالية. Never use booking tools for this.",
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
    description:
      "Change ticket workflow status (اغير حالة الشكوى). Map Arabic: مفتوحة→open, قيد المعالجة→in_progress, بانتظار العميل→waiting_customer, محلولة→resolved, مغلقة/مقفولة→closed. Never call search_bookings. Use only the enum values.",
    parameters: {
      type: "object",
      properties: {
        ticketId: {
          type: "string",
          description: "Ticket number (e.g. TKT-000093) or ticket UUID from the selected ticket",
        },
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
    description:
      "Search the trusted customer's support tickets by ticket number. Call ONLY after the customer provides a ticket number (e.g. TKT-000085). Set query to that exact ticket number. Do NOT pass the customer's phone number as query. Do NOT call this tool just because they asked to track a complaint without a number — ask for the number first. After success, share status/priority/dates only; NEVER reveal subject or description. Do NOT create a new ticket just to answer a status question.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Exact ticket number from the customer (e.g. TKT-000085). Required for status lookup.",
        },
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
