import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { ToolCustomerServicePort } from "./customer-service-port.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    phone: { type: "string", minLength: 7 },
    email: { type: "string" },
  },
  required: ["name", "phone"],
} as const;

const SUPPORTED_STATES: ConversationState[] = [
  "idle",
  "greeting",
  "collecting_information",
  "waiting_user",
  "waiting_api",
  "transferred_to_human",
];

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    throw new Error("Phone must contain 7 to 15 digits.");
  }
  return value.trim();
}

function normalizeEmail(value: unknown): string | null {
  if (value == null) return null;
  const email = typeof value === "string" ? value.trim() : String(value).trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email format is invalid.");
  }
  return email.toLowerCase();
}

export function createCreateCustomerTool(customerService: ToolCustomerServicePort): Tool {
  return {
    supports(state: ConversationState) {
      return SUPPORTED_STATES.includes(state);
    },
    validate(input: Record<string, unknown>) {
      validateAgainstSchema(INPUT_SCHEMA, input);
      normalizePhone(readRequiredString(input.phone, "Phone"));
      normalizeEmail(input.email);
    },
    async execute(context: ToolExecutionContext, input: Record<string, unknown>) {
      const name = readRequiredString(input.name, "Name");
      const phone = normalizePhone(readRequiredString(input.phone, "Phone"));
      const email = normalizeEmail(input.email);

      if (!context.userId) {
        return {
          success: false,
          errorCode: "AUTH_REQUIRED",
          message: "An authenticated user is required to create customers.",
        };
      }

      const duplicateCheck = await customerService.findCustomer({
        companyId: context.companyId,
        userId: context.userId,
        lookupBy: "phone",
        lookupValue: phone,
      });

      if (duplicateCheck.status === "found" && duplicateCheck.customer) {
        return {
          success: false,
          errorCode: "DUPLICATE_CUSTOMER",
          customerId: duplicateCheck.customer.id,
          message: `A customer with phone ${phone} already exists.`,
        };
      }

      if (duplicateCheck.status === "duplicate") {
        return {
          success: false,
          errorCode: "DUPLICATE_CUSTOMER",
          message: `Multiple customers match phone ${phone}. Please clarify with the user.`,
        };
      }

      if (email) {
        const emailCheck = await customerService.findCustomer({
          companyId: context.companyId,
          userId: context.userId,
          lookupBy: "email",
          lookupValue: email,
        });
        if (emailCheck.status === "found" && emailCheck.customer) {
          return {
            success: false,
            errorCode: "DUPLICATE_CUSTOMER",
            customerId: emailCheck.customer.id,
            message: `A customer with email ${email} already exists.`,
          };
        }
      }

      const created = await customerService.createCustomer({
        companyId: context.companyId,
        userId: context.userId,
        name,
        phone,
        email,
      });

      return {
        success: true,
        customerId: created.customer.id,
        message: "Customer created successfully",
      };
    },
  };
}

export const CREATE_CUSTOMER_TOOL_KEY = "create_customer" as const;

export const CREATE_CUSTOMER_LLM_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: CREATE_CUSTOMER_TOOL_KEY,
    description:
      "Create a new customer in the CRM. Use when the user asks to add or register a customer. Requires name and phone; email is optional. Never delete or update customers.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full customer name" },
        phone: { type: "string", description: "Customer phone number" },
        email: { type: "string", description: "Optional customer email" },
      },
      required: ["name", "phone"],
      additionalProperties: false,
    },
  },
};
