/**
 * Leaf constants for create_customer.
 * llm-tool-catalog imports these directly so loading the package barrel does not
 * read CREATE_CUSTOMER_TOOL_KEY while create-customer-tool is still initializing.
 */
export const CREATE_CUSTOMER_TOOL_KEY = "create_customer" as const;

export const CREATE_CUSTOMER_LLM_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: CREATE_CUSTOMER_TOOL_KEY,
    description:
      "Create or resolve a customer in the CRM for booking. Requires customer name and phone (E.164 preferred, or local national with optional ISO-2 region). Never invents country from company locale. If the phone already exists, returns that customerId and preserves the existing CRM name. On WhatsApp, phone must match the current sender; identity uses the Meta sender E.164.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full customer name" },
        phone: {
          type: "string",
          description:
            "Customer phone. Prefer E.164 (+966…). Local nationals require region (ISO-2) unless WhatsApp sender identity is available.",
        },
        region: {
          type: "string",
          description: "Optional ISO-3166-1 alpha-2 region for local/national numbers. Never company country.",
        },
        email: { type: "string", description: "Optional customer email" },
      },
      required: ["name", "phone"],
      additionalProperties: false,
    },
  },
};
