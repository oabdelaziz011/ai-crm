import { CREATE_CUSTOMER_LLM_TOOL_DEFINITION, CREATE_CUSTOMER_TOOL_KEY } from "./tools/create-customer-tool.js";

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
  handlerSource: "builtin_mock" | "create_customer" | "crm_agent" | "scheduling_agent";
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
    description: "Search bookings by customer and recency. Read-only.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "Optional customer UUID filter" },
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
      "Search real bookable appointment availability for a service. Returns available dates, time slots, resource id/name, duration, and capacity. Read-only.",
    parameters: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Scheduling service UUID" },
        resourceId: { type: "string", description: "Optional specific resource UUID" },
        branchId: { type: "string", description: "Optional branch UUID filter" },
        date: { type: "string", description: "Optional YYYY-MM-DD date for slot results" },
        daysAhead: { type: "number", description: "Days to scan when date omitted (default 7, min 1, max 90). Examples: next 7 days = 7, two weeks = 14, this month = 30." },
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
      "Find the first real bookable appointment slot for a service. Skips unavailable dates and returns the earliest open slot with resource, date, and time. Read-only.",
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
    description: "Sets escalated=true without routing to humans.",
    requiredPermissions: ["tools.execute"],
    exclusionReason: "Mock handler — use runtime escalation path instead",
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
    requiredPermissions: ["tools.execute", "customers.search"],
    llmDefinition: SEARCH_CUSTOMER_LLM,
  },
  {
    key: "update_customer",
    displayName: "Update Customer",
    category: "crm",
    classification: "production_ready",
    handlerSource: "crm_agent",
    description: "Updates one field on an existing customer.",
    requiredPermissions: ["tools.execute", "customers.update"],
    llmDefinition: UPDATE_CUSTOMER_LLM,
  },
  {
    key: "merge_customers",
    displayName: "Merge Customers",
    category: "crm",
    classification: "requires_confirmation",
    handlerSource: "crm_agent",
    description: "Merges duplicate customers after explicit confirmation.",
    requiredPermissions: ["tools.execute", "customers.merge"],
    exclusionReason: "Requires explicit user confirmation — agent workflow only",
  },
  {
    key: "import_customers",
    displayName: "Import Customers",
    category: "crm",
    classification: "requires_confirmation",
    handlerSource: "crm_agent",
    description: "Bulk imports customers after explicit confirmation.",
    requiredPermissions: ["tools.execute", "customers.import"],
    exclusionReason: "Requires explicit user confirmation — agent workflow only",
  },
  {
    key: "knowledge_search",
    displayName: "Knowledge Search",
    category: "knowledge",
    classification: "read_only",
    handlerSource: "crm_agent",
    description: "Hybrid/keyword knowledge retrieval.",
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
    requiredPermissions: ["tools.execute", "customers.search"],
    llmDefinition: FIND_DUPLICATES_LLM,
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
