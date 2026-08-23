import { CREATE_CUSTOMER_LLM_TOOL_DEFINITION, CREATE_CUSTOMER_TOOL_KEY } from "./tools/create-customer-tool.js";
import {
  ADD_TICKET_COMMENT_LLM,
  ASSIGN_TICKET_LLM,
  CHANGE_TICKET_PRIORITY_LLM,
  CHANGE_TICKET_STATUS_LLM,
  CLOSE_TICKET_LLM,
  CREATE_TICKET_LLM,
  SEARCH_TICKET_LLM,
  UPDATE_TICKET_LLM,
} from "./tools/ticket-tool-definitions.js";
import {
  ASSIGN_LEAD_LLM,
  CONVERT_LEAD_LLM,
  CREATE_LEAD_LLM,
  CREATE_LEAD_TOOL_KEY,
  MERGE_LEAD_LLM,
  QUALIFY_LEAD_LLM,
  SCORE_LEAD_LLM,
  SEARCH_LEAD_LLM,
  SUGGEST_NEXT_ACTION_LLM,
  UPDATE_LEAD_LLM,
} from "./tools/lead-tool-definitions.js";

export type ToolClassification =
  | "production_ready"
  | "read_only"
  | "mock"
  | "requires_confirmation";

export type LlmFunctionToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolRegistryEntry = {
  key: string;
  displayName: string;
  category: string;
  classification: ToolClassification;
  handlerSource: "builtin_mock" | "create_customer" | "crm_agent" | "scheduling_agent" | "ticket_agent" | "lead_agent" | "handoff_agent" | "workflow_transfer";
  description: string;
  requiredPermissions: string[];
  llmDefinition?: LlmFunctionToolDefinition;
  exclusionReason?: string;
};

const SEARCH_CUSTOMER_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "search_customer",
    description:
      "Search CRM customers by name, email, phone, or inactivity window. Read-only — never creates or updates records.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, email, or phone search term" },
        inactiveDays: { type: "number", description: "Optional: customers inactive for this many days" },
      },
      additionalProperties: false,
    },
  },
};

const UPDATE_CUSTOMER_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "update_customer",
    description: "Update a single field on an existing CRM customer. Requires customerId, field name, and new value.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        field: { type: "string", description: "Field to update (e.g. name, phone, email)" },
        value: { type: "string", description: "New value for the field" },
      },
      required: ["customerId", "field", "value"],
      additionalProperties: false,
    },
  },
};

const KNOWLEDGE_SEARCH_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "knowledge_search",
    description:
      "Search company knowledge base for policies, FAQs, and procedures. Read-only hybrid/keyword retrieval.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const INVOICE_SEARCH_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "invoice_search",
    description: "Search customer invoices. Read-only. Optionally filter by status or overdue only.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Invoice status filter" },
        overdueOnly: { type: "boolean", description: "When true, return only overdue invoices" },
      },
      additionalProperties: false,
    },
  },
};

const BOOKING_SEARCH_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "booking_search",
    description:
      "CRM booking history for the trusted conversation customer only (read-only). Use for سجل الحجوزات / booking history / CRM history / past appointments overview. Do NOT use for cancel, reschedule, check-in, check-out, or phone-based operational lookup — those use search_bookings. Requires the conversation to already have a trusted customer (after phone lookup / search_customer).",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "string",
          description: "Ignored for authorization — trusted conversation customer only",
        },
        daysBack: { type: "number", description: "How many days back to search (default 30)" },
      },
      additionalProperties: false,
    },
  },
};

const SEARCH_AVAILABILITY_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "search_availability",
    description:
      "Search real bookable appointment availability for a service and return a list of open dates/time slots (المواعيد المتاحة). Use when the customer asks what times are open on a date or across several days. Do NOT use for أقرب موعد / earliest / next available — call find_next_available for that intent. Read-only.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Scheduling service UUID" },
        resourceId: { type: "string", description: "Optional specific resource UUID" },
        branchId: { type: "string", description: "Optional branch UUID filter" },
        date: { type: "string", description: "Optional YYYY-MM-DD date for slot results" },
        daysAhead: {
          type: "number",
          description:
            "Days to scan when date is omitted (default 7, min 1, max 90). Omit when date is set. Never pass 0.",
        },
      },
      required: ["serviceId"],
      additionalProperties: false,
    },
  },
};

const FIND_NEXT_AVAILABLE_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "find_next_available",
    description:
      "Find the single earliest/next real bookable appointment slot for a service (أقرب موعد / earliest available / next available). Skips unavailable dates and returns one slot with resource, date, and time. Read-only. Prefer this over search_availability when the customer asks for the nearest appointment rather than a date list.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Scheduling service UUID" },
        resourceId: { type: "string", description: "Optional specific resource UUID" },
        branchId: { type: "string", description: "Optional branch UUID filter" },
        daysAhead: { type: "number", description: "Days to scan (default 7, min 1, max 90)" },
      },
      required: ["serviceId"],
      additionalProperties: false,
    },
  },
};

const RECOMMEND_APPOINTMENT_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "recommend_appointment",
    description:
      "Recommend ranked appointment options for a service using scheduling intelligence. Supports preferred resource, branch, date, and time. Returns top recommendations plus alternatives when the preferred choice is unavailable. Read-only.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Scheduling service UUID" },
        preferredResourceId: { type: "string", description: "Optional preferred resource UUID" },
        preferredBranchId: { type: "string", description: "Optional preferred branch UUID" },
        preferredDate: { type: "string", description: "Optional preferred date YYYY-MM-DD" },
        preferredTime: { type: "string", description: "Optional preferred local time HH:mm" },
        daysAhead: { type: "number", description: "Days to scan (default 7, min 1, max 90)" },
      },
      required: ["serviceId"],
      additionalProperties: false,
    },
  },
};

const CREATE_BOOKING_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "create_booking",
    description:
      "Create a confirmed scheduling booking for a customer, service, resource, and slot. Persists to canonical scheduling tables only.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "CRM customer UUID" },
        serviceId: { type: "string", description: "Scheduling service UUID" },
        resourceId: { type: "string", description: "Scheduling resource UUID" },
        date: { type: "string", description: "Appointment date YYYY-MM-DD" },
        slotStart: { type: "string", description: "Local start time HH:mm" },
        branchId: { type: "string", description: "Optional branch UUID" },
        notes: { type: "string", description: "Optional booking notes" },
      },
      required: ["customerId", "serviceId", "resourceId", "date", "slotStart"],
      additionalProperties: false,
    },
  },
};

const SEARCH_BOOKINGS_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "search_bookings",
    description:
      "Operational scheduling booking lookup by patient phone or trusted conversation customer. REQUIRED when the customer sends a phone to look up bookings, or wants to cancel/reschedule/check-in/check-out and needs a selectable booking list. Pass purpose=\"cancel\" for cancellation flows. Never stay silent — use customerFacingMessage. When purpose is cancel and multiple bookings exist, ask which one; do NOT cancel yet. Do NOT use for CRM booking-history / سجل الحجوزات — that is booking_search.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "Ignored — do not use for ownership" },
        phone: {
          type: "string",
          description: "Patient mobile number to look up bookings for (preferred when the customer sends a phone)",
        },
        daysBack: { type: "number", description: "Days of history to include (default 30, or 90 with phone)" },
        purpose: {
          type: "string",
          description: 'Use "cancel" when helping cancel an appointment; otherwise omit or "list".',
        },
      },
      additionalProperties: false,
    },
  },
};

const RESCHEDULE_BOOKING_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "reschedule_booking",
    description: "Reschedule an existing booking to a new date and time slot.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking UUID" },
        date: { type: "string", description: "New appointment date YYYY-MM-DD" },
        slotStart: { type: "string", description: "New local start time HH:mm" },
        reason: { type: "string", description: "Optional reschedule reason" },
      },
      required: ["bookingId", "date", "slotStart"],
      additionalProperties: false,
    },
  },
};

const CANCEL_BOOKING_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "cancel_booking",
    description:
      "Cancel one existing booking AFTER the customer clearly selected it (list number or BK- reference from search_bookings). Prefer bookingReference (BK-…) when that is what the customer sent. Never cancel without a selection.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking UUID of the selected appointment" },
        bookingReference: {
          type: "string",
          description: "Customer-facing booking number like BK-000025",
        },
        reason: { type: "string", description: "Optional cancellation reason" },
        phone: {
          type: "string",
          description: "Patient mobile used to authorize cancel when needed",
        },
      },
      additionalProperties: false,
    },
  },
};

const CHECK_IN_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "check_in",
    description:
      "Check in a customer for their scheduled booking. Prefer bookingId UUID, or bookingReference (BK-…) with patient phone when trusted customer is not yet linked.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking UUID" },
        bookingReference: { type: "string", description: "Booking confirmation like BK-000035" },
        phone: { type: "string", description: "Patient mobile used to prove ownership when needed" },
        roomId: { type: "string", description: "Optional room UUID" },
      },
      additionalProperties: false,
    },
  },
};

const CHECK_OUT_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "check_out",
    description:
      "Check out a customer after their appointment. Prefer bookingId UUID, or bookingReference (BK-…) with patient phone when trusted customer is not yet linked.",
    parameters: {
      type: "object",
      properties: {
        bookingId: { type: "string", description: "Booking UUID" },
        bookingReference: { type: "string", description: "Booking confirmation like BK-000035" },
        phone: { type: "string", description: "Patient mobile used to prove ownership when needed" },
      },
      additionalProperties: false,
    },
  },
};

const RETURN_TO_AI_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "return_to_ai",
    description: "Return a human-handled conversation back to the AI employee after resolution.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why the conversation is returning to AI" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
};

const ESCALATE_TO_HUMAN_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "escalate_to_human",
    description: "Escalate the active conversation to a human agent using the handoff platform.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        triggerCode: { type: "string" },
        targetQueueId: { type: "string" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
};

const QUEUE_HANDOFF_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "queue_handoff",
    description: "Place the active conversation into a human handoff queue.",
    parameters: {
      type: "object",
      properties: {
        queueId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["queueId", "reason"],
      additionalProperties: false,
    },
  },
};

const TRANSFER_TO_WORKFLOW_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "transfer_to_workflow",
    description:
      "Hand this messaging thread to the configured automation workflow (for example booking). Call when the customer asks for a structured flow such as booking, choosing from lists, or completing a multi-step process. After success, reply using customerFacingMessage from the tool result.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the customer needs the workflow, in short form",
        },
        flowId: {
          type: "string",
          description: "Optional flow id; defaults to the employee transferable flow",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
};

const FIND_DUPLICATES_LLM: LlmFunctionToolDefinition = {
  type: "function",
  function: {
    name: "find_duplicate_customers",
    description:
      "Detect duplicate CRM profiles grouped by matching phone or email. Read-only — does not merge records.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
};

export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  {
    key: "knowledge_lookup",
    displayName: "Knowledge Lookup",
    category: "knowledge",
    classification: "mock",
    handlerSource: "builtin_mock",
    description: "Returns placeholder knowledge articles.",
    requiredPermissions: ["tools.execute"],
    exclusionReason: "Mock handler — no real retrieval",
  },
  {
    key: "crm_lookup",
    displayName: "CRM Lookup",
    category: "crm",
    classification: "mock",
    handlerSource: "builtin_mock",
    description: "Returns placeholder CRM records.",
    requiredPermissions: ["tools.execute"],
    exclusionReason: "Mock handler — superseded by search_customer",
  },
  {
    key: "customer_profile",
    displayName: "Customer Profile",
    category: "crm",
    classification: "mock",
    handlerSource: "builtin_mock",
    description: "Returns a fake customer profile snapshot.",
    requiredPermissions: ["tools.execute"],
    exclusionReason: "Mock handler — use search_customer instead",
  },
  {
    key: "search_availability",
    displayName: "Search Availability",
    category: "scheduling",
    classification: "read_only",
    handlerSource: "scheduling_agent",
    description: "Production availability search via slot and availability engines.",
    requiredPermissions: ["tools.execute", "availability.search"],
    llmDefinition: SEARCH_AVAILABILITY_LLM,
  },
  {
    key: "find_next_available",
    displayName: "Find Next Available",
    category: "scheduling",
    classification: "read_only",
    handlerSource: "scheduling_agent",
    description: "Returns the first bookable appointment slot within a configurable search window.",
    requiredPermissions: ["tools.execute", "availability.search"],
    llmDefinition: FIND_NEXT_AVAILABLE_LLM,
  },
  {
    key: "recommend_appointment",
    displayName: "Recommend Appointment",
    category: "scheduling",
    classification: "read_only",
    handlerSource: "scheduling_agent",
    description: "Intelligent ranked appointment recommendations with alternative resource and branch suggestions.",
    requiredPermissions: ["tools.execute", "availability.search"],
    llmDefinition: RECOMMEND_APPOINTMENT_LLM,
  },
  {
    key: "create_booking",
    displayName: "Create Booking",
    category: "scheduling",
    classification: "production_ready",
    handlerSource: "scheduling_agent",
    description: "Production booking creation via BookingDomainService.",
    requiredPermissions: ["tools.execute", "bookings.create"],
    llmDefinition: CREATE_BOOKING_LLM,
  },
  {
    key: "search_bookings",
    displayName: "Search Bookings",
    category: "scheduling",
    classification: "read_only",
    handlerSource: "scheduling_agent",
    description: "Search recent bookings via BookingApplicationService.",
    requiredPermissions: ["tools.execute", "bookings.view"],
    llmDefinition: SEARCH_BOOKINGS_LLM,
  },
  {
    key: "reschedule_booking",
    displayName: "Reschedule Booking",
    category: "scheduling",
    classification: "production_ready",
    handlerSource: "scheduling_agent",
    description: "Reschedule an existing booking via BookingApplicationService.",
    requiredPermissions: ["tools.execute", "bookings.edit"],
    llmDefinition: RESCHEDULE_BOOKING_LLM,
  },
  {
    key: "cancel_booking",
    displayName: "Cancel Booking",
    category: "scheduling",
    classification: "production_ready",
    handlerSource: "scheduling_agent",
    description: "Cancel a booking via BookingApplicationService.",
    requiredPermissions: ["tools.execute", "bookings.edit"],
    llmDefinition: CANCEL_BOOKING_LLM,
  },
  {
    key: "check_in",
    displayName: "Check In",
    category: "scheduling",
    classification: "production_ready",
    handlerSource: "scheduling_agent",
    description: "Check in a booking via BookingApplicationService.",
    requiredPermissions: ["tools.execute", "bookings.edit"],
    llmDefinition: CHECK_IN_LLM,
  },
  {
    key: "check_out",
    displayName: "Check Out",
    category: "scheduling",
    classification: "production_ready",
    handlerSource: "scheduling_agent",
    description: "Check out a booking via BookingApplicationService.",
    requiredPermissions: ["tools.execute", "bookings.edit"],
    llmDefinition: CHECK_OUT_LLM,
  },
  {
    key: "booking",
    displayName: "Booking",
    category: "scheduling",
    classification: "mock",
    handlerSource: "builtin_mock",
    description: "Deprecated mock booking handler.",
    requiredPermissions: ["tools.execute"],
    exclusionReason: "Mock write — replaced by create_booking",
  },
  {
    key: "faq",
    displayName: "FAQ",
    category: "knowledge",
    classification: "mock",
    handlerSource: "builtin_mock",
    description: "Returns canned FAQ text.",
    requiredPermissions: ["tools.execute"],
    exclusionReason: "Mock handler — use knowledge_search instead",
  },
  {
    key: "notification",
    displayName: "Notification",
    category: "control",
    classification: "mock",
    handlerSource: "builtin_mock",
    description: "Fake delivered flag — does not send WhatsApp or email.",
    requiredPermissions: ["tools.execute"],
    exclusionReason: "Mock handler — no channel delivery",
  },
  {
    key: "escalation",
    displayName: "Escalation",
    category: "control",
    classification: "mock",
    handlerSource: "builtin_mock",
    description: "Deprecated mock escalation handler.",
    requiredPermissions: ["tools.execute"],
    exclusionReason: "Mock handler — use escalate_to_human instead",
  },
  {
    key: "escalate_to_human",
    displayName: "Escalate To Human",
    category: "handoff",
    classification: "production_ready",
    handlerSource: "handoff_agent",
    description: "Production human handoff escalation via Human Handoff Platform.",
    requiredPermissions: ["tools.execute", "handoff.escalate"],
    llmDefinition: ESCALATE_TO_HUMAN_LLM,
  },
  {
    key: "queue_handoff",
    displayName: "Queue Handoff",
    category: "handoff",
    classification: "production_ready",
    handlerSource: "handoff_agent",
    description: "Queue conversation for human pickup.",
    requiredPermissions: ["tools.execute", "handoff.queue"],
    llmDefinition: QUEUE_HANDOFF_LLM,
  },
  {
    key: "transfer_to_workflow",
    displayName: "Transfer To Workflow",
    category: "automation",
    classification: "production_ready",
    handlerSource: "workflow_transfer",
    description:
      "Hand the messaging thread to a configured automation workflow (AI-first → workflow).",
    requiredPermissions: ["tools.execute"],
    llmDefinition: TRANSFER_TO_WORKFLOW_LLM,
  },
  {
    key: "return_to_ai",
    displayName: "Return To AI",
    category: "handoff",
    classification: "production_ready",
    handlerSource: "handoff_agent",
    description: "Return a human-handled conversation to the AI employee.",
    requiredPermissions: ["tools.execute", "handoff.return_to_ai"],
    llmDefinition: RETURN_TO_AI_LLM,
  },
  {
    key: CREATE_CUSTOMER_TOOL_KEY,
    displayName: "Create Customer",
    category: "crm",
    classification: "production_ready",
    handlerSource: "create_customer",
    description: "Creates a CRM customer with name and phone.",
    requiredPermissions: ["tools.execute", "customers.create"],
    llmDefinition: CREATE_CUSTOMER_LLM_TOOL_DEFINITION,
  },
  {
    key: "search_customer",
    displayName: "Search Customers",
    category: "crm",
    classification: "read_only",
    handlerSource: "crm_agent",
    description: "Search CRM customers by query or inactivity.",
    requiredPermissions: ["tools.execute", "customers.view"],
    llmDefinition: SEARCH_CUSTOMER_LLM,
  },
  {
    key: "update_customer",
    displayName: "Update Customer",
    category: "crm",
    classification: "production_ready",
    handlerSource: "crm_agent",
    description: "Updates one field on an existing customer.",
    requiredPermissions: ["tools.execute", "customers.edit"],
    llmDefinition: UPDATE_CUSTOMER_LLM,
  },
  {
    key: "merge_customers",
    displayName: "Merge Customers",
    category: "crm",
    classification: "requires_confirmation",
    handlerSource: "crm_agent",
    description: "Merges duplicate customers after explicit confirmation.",
    requiredPermissions: ["tools.execute", "customers.edit", "customers.delete"],
    exclusionReason: "Requires explicit user confirmation — agent workflow only",
  },
  {
    key: "import_customers",
    displayName: "Import Customers",
    category: "crm",
    classification: "requires_confirmation",
    handlerSource: "crm_agent",
    description: "Bulk imports customers after explicit confirmation.",
    requiredPermissions: ["tools.execute", "customers.create"],
    exclusionReason: "Requires explicit user confirmation — agent workflow only",
  },
  {
    key: "knowledge_search",
    displayName: "Knowledge Search",
    category: "knowledge",
    classification: "read_only",
    handlerSource: "crm_agent",
    description: "Semantic knowledge retrieval (RAG) over the company knowledge base.",
    requiredPermissions: ["tools.execute", "knowledge.view"],
    llmDefinition: KNOWLEDGE_SEARCH_LLM,
  },
  {
    key: "invoice_search",
    displayName: "Invoice Search",
    category: "billing",
    classification: "read_only",
    handlerSource: "crm_agent",
    description: "Reads customer invoices from billing tables.",
    requiredPermissions: ["tools.execute", "invoices.view"],
    llmDefinition: INVOICE_SEARCH_LLM,
  },
  {
    key: "booking_search",
    displayName: "Booking Search",
    category: "scheduling",
    classification: "read_only",
    handlerSource: "crm_agent",
    description: "Reads bookings from scheduling tables.",
    requiredPermissions: ["tools.execute", "bookings.view"],
    llmDefinition: BOOKING_SEARCH_LLM,
  },
  {
    key: "find_duplicate_customers",
    displayName: "Find Duplicate Customers",
    category: "crm",
    classification: "read_only",
    handlerSource: "crm_agent",
    description: "Groups duplicate CRM profiles by phone/email.",
    requiredPermissions: ["tools.execute", "customers.view"],
    llmDefinition: FIND_DUPLICATES_LLM,
  },
  {
    key: "create_ticket",
    displayName: "Create Ticket",
    category: "support",
    classification: "production_ready",
    handlerSource: "ticket_agent",
    description: "Creates a support ticket with subject, description, and priority.",
    requiredPermissions: ["tools.execute", "tickets.create"],
    llmDefinition: CREATE_TICKET_LLM,
  },
  {
    key: "update_ticket",
    displayName: "Update Ticket",
    category: "support",
    classification: "production_ready",
    handlerSource: "ticket_agent",
    description: "Updates subject or description on an existing support ticket.",
    requiredPermissions: ["tools.execute", "tickets.edit"],
    llmDefinition: UPDATE_TICKET_LLM,
  },
  {
    key: "close_ticket",
    displayName: "Close Ticket",
    category: "support",
    classification: "production_ready",
    handlerSource: "ticket_agent",
    description: "Closes or resolves a support ticket.",
    requiredPermissions: ["tools.execute", "tickets.close"],
    llmDefinition: CLOSE_TICKET_LLM,
  },
  {
    key: "assign_ticket",
    displayName: "Assign Ticket",
    category: "support",
    classification: "production_ready",
    handlerSource: "ticket_agent",
    description: "Assigns a support ticket to a human agent.",
    requiredPermissions: ["tools.execute", "tickets.assign"],
    llmDefinition: ASSIGN_TICKET_LLM,
  },
  {
    key: "add_ticket_comment",
    displayName: "Add Ticket Comment",
    category: "support",
    classification: "production_ready",
    handlerSource: "ticket_agent",
    description: "Adds a public or internal comment to a support ticket.",
    requiredPermissions: ["tools.execute", "tickets.comment"],
    llmDefinition: ADD_TICKET_COMMENT_LLM,
  },
  {
    key: "change_ticket_priority",
    displayName: "Change Ticket Priority",
    category: "support",
    classification: "production_ready",
    handlerSource: "ticket_agent",
    description: "Changes support ticket priority.",
    requiredPermissions: ["tools.execute", "tickets.edit"],
    llmDefinition: CHANGE_TICKET_PRIORITY_LLM,
  },
  {
    key: "change_ticket_status",
    displayName: "Change Ticket Status",
    category: "support",
    classification: "production_ready",
    handlerSource: "ticket_agent",
    description: "Changes support ticket workflow status.",
    requiredPermissions: ["tools.execute", "tickets.edit"],
    llmDefinition: CHANGE_TICKET_STATUS_LLM,
  },
  {
    key: "search_ticket",
    displayName: "Search Tickets",
    category: "support",
    classification: "read_only",
    handlerSource: "ticket_agent",
    description: "Searches support tickets by keyword, status, priority, or assignee.",
    requiredPermissions: ["tools.execute", "tickets.view"],
    llmDefinition: SEARCH_TICKET_LLM,
  },
  {
    key: CREATE_LEAD_TOOL_KEY,
    displayName: "Create Lead",
    category: "sales",
    classification: "production_ready",
    handlerSource: "lead_agent",
    description: "Creates a sales lead for unknown or prospective contacts.",
    requiredPermissions: ["tools.execute", "leads.create"],
    llmDefinition: CREATE_LEAD_LLM,
  },
  {
    key: "update_lead",
    displayName: "Update Lead",
    category: "sales",
    classification: "production_ready",
    handlerSource: "lead_agent",
    description: "Updates lead contact fields or score.",
    requiredPermissions: ["tools.execute", "leads.edit"],
    llmDefinition: UPDATE_LEAD_LLM,
  },
  {
    key: "qualify_lead",
    displayName: "Qualify Lead",
    category: "sales",
    classification: "production_ready",
    handlerSource: "lead_agent",
    description: "Qualifies a lead for the sales pipeline.",
    requiredPermissions: ["tools.execute", "leads.qualify"],
    llmDefinition: QUALIFY_LEAD_LLM,
  },
  {
    key: "convert_lead",
    displayName: "Convert Lead",
    category: "sales",
    classification: "production_ready",
    handlerSource: "lead_agent",
    description: "Converts a lead into a CRM customer.",
    requiredPermissions: ["tools.execute", "leads.convert"],
    llmDefinition: CONVERT_LEAD_LLM,
  },
  {
    key: "assign_lead",
    displayName: "Assign Lead",
    category: "sales",
    classification: "production_ready",
    handlerSource: "lead_agent",
    description: "Assigns a lead to a sales agent.",
    requiredPermissions: ["tools.execute", "leads.assign"],
    llmDefinition: ASSIGN_LEAD_LLM,
  },
  {
    key: "search_lead",
    displayName: "Search Leads",
    category: "sales",
    classification: "read_only",
    handlerSource: "lead_agent",
    description: "Searches leads by contact details or lifecycle status.",
    requiredPermissions: ["tools.execute", "leads.view"],
    llmDefinition: SEARCH_LEAD_LLM,
  },
  {
    key: "merge_lead",
    displayName: "Merge Leads",
    category: "sales",
    classification: "production_ready",
    handlerSource: "lead_agent",
    description: "Merges duplicate leads into a primary lead.",
    requiredPermissions: ["tools.execute", "leads.merge"],
    llmDefinition: MERGE_LEAD_LLM,
  },
  {
    key: "score_lead",
    displayName: "Score Lead",
    category: "sales",
    classification: "production_ready",
    handlerSource: "lead_agent",
    description: "Updates lead score.",
    requiredPermissions: ["tools.execute", "leads.edit"],
    llmDefinition: SCORE_LEAD_LLM,
  },
  {
    key: "suggest_next_action",
    displayName: "Suggest Next Action",
    category: "sales",
    classification: "read_only",
    handlerSource: "lead_agent",
    description: "Suggests the next best sales action for a lead.",
    requiredPermissions: ["tools.execute", "leads.view"],
    llmDefinition: SUGGEST_NEXT_ACTION_LLM,
  },
];

export function isLlmExposableClassification(classification: ToolClassification): boolean {
  return classification === "production_ready" || classification === "read_only";
}

export function resolveLlmToolExposure(registeredToolKeys: readonly string[]): {
  llmTools: LlmFunctionToolDefinition[];
  allowedToolKeys: string[];
  exposed: ToolRegistryEntry[];
  excludedMocks: ToolRegistryEntry[];
  protectedConfirmation: ToolRegistryEntry[];
  gaps: ToolRegistryEntry[];
} {
  const registered = new Set(registeredToolKeys);
  const exposed: ToolRegistryEntry[] = [];
  const excludedMocks: ToolRegistryEntry[] = [];
  const protectedConfirmation: ToolRegistryEntry[] = [];
  const gaps: ToolRegistryEntry[] = [];

  for (const entry of TOOL_REGISTRY) {
    if (entry.classification === "mock") {
      excludedMocks.push(entry);
      continue;
    }
    if (entry.classification === "requires_confirmation") {
      protectedConfirmation.push(entry);
      continue;
    }
    if (!isLlmExposableClassification(entry.classification)) {
      continue;
    }
    if (!registered.has(entry.key)) {
      gaps.push(entry);
      continue;
    }
    if (!entry.llmDefinition) {
      gaps.push(entry);
      continue;
    }
    exposed.push(entry);
  }

  return {
    llmTools: exposed.map((entry) => entry.llmDefinition!),
    allowedToolKeys: exposed.map((entry) => entry.key),
    exposed,
    excludedMocks,
    protectedConfirmation,
    gaps,
  };
}

export function buildToolRouterAuditReport(registeredToolKeys: readonly string[]) {
  const exposure = resolveLlmToolExposure(registeredToolKeys);
    const previouslyExposed: string[] = [CREATE_CUSTOMER_TOOL_KEY];
    const newlyExposed = exposure.allowedToolKeys.filter((key) => !previouslyExposed.includes(key));

  return {
    auditedAt: new Date().toISOString(),
    registeredToolCount: registeredToolKeys.length,
    registeredTools: [...registeredToolKeys].sort(),
    classifications: TOOL_REGISTRY.map((entry) => ({
      key: entry.key,
      displayName: entry.displayName,
      category: entry.category,
      classification: entry.classification,
      handlerSource: entry.handlerSource,
      llmExposed: exposure.exposed.some((e) => e.key === entry.key),
      exclusionReason: entry.exclusionReason ?? null,
    })),
    llmExposure: {
      previouslyExposed,
      newlyExposed,
      currentlyExposed: exposure.allowedToolKeys,
      exposedCount: exposure.allowedToolKeys.length,
    },
    excludedMockTools: exposure.excludedMocks.map((entry) => ({
      key: entry.key,
      reason: entry.exclusionReason,
    })),
    protectedConfirmationTools: exposure.protectedConfirmation.map((entry) => ({
      key: entry.key,
      reason: entry.exclusionReason,
    })),
    remainingGaps: exposure.gaps.map((entry) => ({
      key: entry.key,
      classification: entry.classification,
      reason: registeredToolKeys.includes(entry.key)
        ? "Missing LLM function definition"
        : "Handler not registered in runtime wiring",
    })),
    rbacNote:
      "ToolRouterService.route() still enforces tools.execute and per-tool required_permissions from tool_definitions.",
    confirmationNote:
      "merge_customers and import_customers remain callable via agent workflows (triggeredBy=agent) with in-handler confirmation gates.",
  };
}
