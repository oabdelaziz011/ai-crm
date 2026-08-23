import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { CrmAgentToolPorts } from "./crm-agent-ports.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

const ACTIVE_STATES: ConversationState[] = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "transferred_to_human",
];

function requireUser(context: ToolExecutionContext): string {
  if (!context.userId) throw new Error("Authentication required.");
  return context.userId;
}

function requireCompany(context: ToolExecutionContext): string {
  const companyId = typeof context.companyId === "string" ? context.companyId.trim() : "";
  if (!companyId) throw new Error("Company context is required.");
  return companyId;
}

function createSearchCustomerTool(ports: CrmAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema({ type: "object", properties: { query: { type: "string" }, inactiveDays: { type: "number" } } }, input);
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const result = await ports.searchCustomers({
        companyId: context.companyId,
        userId,
        query: typeof input.query === "string" ? input.query : undefined,
        inactiveDays: typeof input.inactiveDays === "number" ? input.inactiveDays : undefined,
      });
      return { success: true, customers: result.customers, total: result.total, results: result.customers };
    },
  };
}

function createUpdateCustomerTool(ports: CrmAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: { customerId: { type: "string" }, field: { type: "string" }, value: { type: "string" } },
          required: ["customerId", "field", "value"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const companyId = requireCompany(context);
      const result = await ports.updateCustomer({
        companyId,
        userId,
        customerId: String(input.customerId),
        field: String(input.field),
        value: String(input.value),
      });
      return { success: true, customer: result.customer, customerId: result.customer.id };
    },
  };
}

function createMergeCustomersTool(ports: CrmAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            primaryCustomerId: { type: "string" },
            duplicateCustomerIds: { type: "array", items: { type: "string" } },
            confirmed: { type: "boolean" },
          },
          required: ["primaryCustomerId", "duplicateCustomerIds"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const companyId = requireCompany(context);
      const confirmed = input.confirmed === true;
      if (!confirmed) {
        return {
          success: false,
          requiresConfirmation: true,
          message: "Merge requires explicit user confirmation before execution.",
        };
      }
      return ports.mergeCustomers({
        companyId,
        userId,
        primaryCustomerId: String(input.primaryCustomerId),
        duplicateCustomerIds: (input.duplicateCustomerIds as string[]) ?? [],
        confirmed: true,
      });
    },
  };
}

function parseImportRowsFromGoal(goal: string): Array<{ name: string; phone?: string; email?: string }> {
  const rows: Array<{ name: string; phone?: string; email?: string }> = [];
  const segments = goal.split(/[\n;]+/);
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed || /import/i.test(trimmed) && !trimmed.includes(",")) continue;
    const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    rows.push({
      name: parts[0],
      phone: parts[1],
      email: parts[2],
    });
  }
  return rows;
}

function createImportCustomersTool(ports: CrmAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            rows: { type: "array" },
            confirmed: { type: "boolean" },
          },
          required: ["rows"],
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const companyId = requireCompany(context);
      let rows = (Array.isArray(input.rows) ? input.rows : []) as Array<{ name: string; phone?: string; email?: string }>;
      if (rows.length === 0 && typeof input.goal === "string") {
        rows = parseImportRowsFromGoal(input.goal);
      }

      if (input.confirmed !== true) {
        return {
          success: false,
          requiresConfirmation: true,
          previewCount: rows.length,
          message: "Import requires explicit user confirmation before execution.",
        };
      }

      return ports.importCustomers({
        companyId,
        userId,
        rows,
        confirmed: true,
      });
    },
  };
}

function createKnowledgeSearchTool(ports: CrmAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema({ type: "object", properties: { query: { type: "string" } }, required: ["query"] }, input);
    },
    async execute(context, input) {
      const userId = requireUser(context);
      const companyId = requireCompany(context);
      const query = String(input.query ?? input.goal ?? "");
      // Trusted companyId from ToolRouter context only — LLM may supply query, never tenant IDs.
      const result = await ports.knowledgeSearch({ companyId, userId, query });
      return {
        success: true,
        results: result.results,
        contextText: result.contextText,
        items: result.results,
      };
    },
  };
}

/** Safe model-facing copy — do not reveal other customers' invoices. */
export const INVOICE_CUSTOMER_CONTEXT_REQUIRED_MESSAGE =
  "يجب تحديد العميل في هذه المحادثة أولاً قبل البحث عن الفواتير.";

function createInvoiceSearchTool(ports: CrmAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            status: { type: "string" },
            overdueOnly: { type: "boolean" },
            // Accepted for schema compatibility only — never used for authorization.
            customerId: { type: "string" },
          },
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      // Never trust LLM customerId — conversation customer only (Phase 5C).
      const trustedCustomerId = context.trustedCustomerId?.trim() || null;
      if (!trustedCustomerId) {
        return {
          success: false,
          errorCode: "CUSTOMER_CONTEXT_REQUIRED",
          errors: ["CUSTOMER_CONTEXT_REQUIRED"],
          message: INVOICE_CUSTOMER_CONTEXT_REQUIRED_MESSAGE,
          invoices: [],
          results: [],
          total: 0,
        };
      }

      const result = await ports.searchInvoices({
        companyId: context.companyId,
        userId,
        trustedCustomerId,
        status: typeof input.status === "string" ? input.status : undefined,
        overdueOnly: input.overdueOnly === true,
      });

      if (result.errors?.length) {
        return {
          success: false,
          errorCode: result.errors[0],
          errors: result.errors,
          message: result.message ?? INVOICE_CUSTOMER_CONTEXT_REQUIRED_MESSAGE,
          invoices: [],
          results: [],
          total: 0,
        };
      }

      return { success: true, invoices: result.invoices, total: result.total, results: result.invoices };
    },
  };
}

/** Safe model-facing copy — do not reveal other customers' bookings. */
export const BOOKING_SEARCH_CUSTOMER_CONTEXT_REQUIRED_MESSAGE =
  "يجب تحديد العميل في هذه المحادثة أولاً قبل البحث عن الحجوزات.";

function createBookingSearchTool(ports: CrmAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate(input) {
      validateAgainstSchema(
        {
          type: "object",
          properties: {
            // Accepted for schema compatibility only — never used for authorization.
            customerId: { type: "string" },
            daysBack: { type: "number" },
          },
        },
        input,
      );
    },
    async execute(context, input) {
      const userId = requireUser(context);
      // Never trust LLM customerId — conversation customer only (Phase 5D).
      const trustedCustomerId = context.trustedCustomerId?.trim() || null;
      if (!trustedCustomerId) {
        return {
          success: false,
          errorCode: "CUSTOMER_CONTEXT_REQUIRED",
          errors: ["CUSTOMER_CONTEXT_REQUIRED"],
          message: BOOKING_SEARCH_CUSTOMER_CONTEXT_REQUIRED_MESSAGE,
          bookings: [],
          results: [],
          total: 0,
        };
      }

      const result = await ports.searchBookings({
        companyId: context.companyId,
        userId,
        trustedCustomerId,
        daysBack: typeof input.daysBack === "number" ? input.daysBack : 30,
      });

      if (result.errors?.length) {
        return {
          success: false,
          errorCode: result.errors[0],
          errors: result.errors,
          message: result.message ?? BOOKING_SEARCH_CUSTOMER_CONTEXT_REQUIRED_MESSAGE,
          bookings: [],
          results: [],
          total: 0,
        };
      }

      return { success: true, bookings: result.bookings, total: result.total, results: result.bookings };
    },
  };
}

function createFindDuplicatesTool(ports: CrmAgentToolPorts): Tool {
  return {
    supports: (state) => ACTIVE_STATES.includes(state),
    validate() {},
    async execute(context) {
      const userId = requireUser(context);
      const result = await ports.findDuplicateCustomers({ companyId: context.companyId, userId });
      return {
        success: true,
        groups: result.groups,
        total: result.groups.length,
        results: result.groups,
      };
    },
  };
}

export function createCrmAgentTools(ports: CrmAgentToolPorts): Record<string, Tool> {
  return {
    search_customer: createSearchCustomerTool(ports),
    update_customer: createUpdateCustomerTool(ports),
    merge_customers: createMergeCustomersTool(ports),
    import_customers: createImportCustomersTool(ports),
    knowledge_search: createKnowledgeSearchTool(ports),
    invoice_search: createInvoiceSearchTool(ports),
    booking_search: createBookingSearchTool(ports),
    find_duplicate_customers: createFindDuplicatesTool(ports),
  };
}

export const CRM_AGENT_TOOL_KEYS = [
  "search_customer",
  "update_customer",
  "merge_customers",
  "import_customers",
  "knowledge_search",
  "invoice_search",
  "booking_search",
  "find_duplicate_customers",
] as const;
