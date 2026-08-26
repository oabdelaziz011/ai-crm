import type { ConversationState } from "@workspace/ai-conversation";
import type { Tool, ToolExecutionContext } from "./tool-contract.js";
import type { ToolCustomerServicePort } from "./customer-service-port.js";
import { validateAgainstSchema } from "../utils/tool-utils.js";
import {
  INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR,
  validateEgyptMobilePhone,
} from "../utils/customer-phone-normalization.js";
import {
  buildExistingCustomerGreetingAr,
  buildNewCustomerGreetingAr,
} from "../utils/scheduling-customer-display.js";
import {
  buildWhatsAppSenderPhoneLookupVariants,
  customerPhoneMatchesWhatsAppSender,
} from "../utils/resolve-trusted-channel-customer.js";

const INPUT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    phone: { type: "string", minLength: 7 },
    email: { type: "string" },
  },
  required: ["name", "phone"],
} as const;

const INCOMPLETE_FULL_NAME_MESSAGE_AR =
  "محتاجين الاسم الكامل للعميل (مش الاسم الأول فقط). ممكن تقوليلي الاسم بالكامل؟";

const PHONE_SENDER_MISMATCH_MESSAGE_AR =
  "رقم الموبايل لازم يكون نفس رقم واتساب اللي بيتكلم منه العميل دلوقتي.";

function isCompleteCustomerFullName(name: string): boolean {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every((token) => /[\u0600-\u06FFa-zA-Z]{2,}/.test(token));
}

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
  const validated = validateEgyptMobilePhone(value);
  if (!validated.valid) {
    if (validated.reason === "incomplete") {
      throw new Error(INCOMPLETE_EGYPT_MOBILE_MESSAGE_AR);
    }
    throw new Error("Phone must be a valid Egyptian mobile number (11 digits starting with 01).");
  }
  return validated.local;
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

async function findCustomerByPhoneVariants(
  customerService: ToolCustomerServicePort,
  context: ToolExecutionContext,
  phone: string,
) {
  const variants = buildWhatsAppSenderPhoneLookupVariants(phone);
  let duplicate = false;
  for (const variant of variants) {
    const result = await customerService.findCustomer({
      companyId: context.companyId,
      userId: context.userId!,
      lookupBy: "phone",
      lookupValue: variant,
    });
    if (result.status === "found" && result.customer) {
      return result;
    }
    if (result.status === "duplicate") {
      duplicate = true;
    }
  }
  if (duplicate) {
    return { status: "duplicate" as const, count: 2 };
  }
  return { status: "not_found" as const, count: 0 as const };
}

async function linkAndStampTrusted(
  customerService: ToolCustomerServicePort,
  conversationId: string,
  customerId: string,
  customerName: string,
) {
  await customerService.linkConversationCustomer?.({
    conversationId,
    customerId,
    customerName,
    stampTrustedIdentity: true,
  });
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
      if (!isCompleteCustomerFullName(name)) {
        return {
          success: false,
          errorCode: "INCOMPLETE_FULL_NAME",
          message: "Customer full name is required (first + family name).",
          customerFacingMessage: INCOMPLETE_FULL_NAME_MESSAGE_AR,
        };
      }
      const phone = normalizePhone(readRequiredString(input.phone, "Phone"));
      const email = normalizeEmail(input.email);

      if (!context.userId) {
        return {
          success: false,
          errorCode: "AUTH_REQUIRED",
          message: "An authenticated user is required to create customers.",
        };
      }

      // WhatsApp: CRM phone must match the current inbound sender — never another customer's number.
      const channelSender = await customerService.getConversationWhatsAppSender?.({
        conversationId: context.conversationId,
      });
      if (
        channelSender &&
        !customerPhoneMatchesWhatsAppSender(phone, channelSender)
      ) {
        return {
          success: false,
          errorCode: "PHONE_SENDER_MISMATCH",
          message: "Customer phone must match the WhatsApp sender for this conversation.",
          customerFacingMessage: PHONE_SENDER_MISMATCH_MESSAGE_AR,
        };
      }

      const duplicateCheck = await findCustomerByPhoneVariants(
        customerService,
        context,
        phone,
      );

      if (duplicateCheck.status === "found" && duplicateCheck.customer) {
        const customer = duplicateCheck.customer;
        await linkAndStampTrusted(
          customerService,
          context.conversationId,
          customer.id,
          customer.name,
        );
        return {
          success: true,
          customerId: customer.id,
          existing: true,
          customerName: customer.name,
          customerGreeting: buildExistingCustomerGreetingAr(customer.name),
          message: "Customer already exists. Use this customerId for create_booking.",
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

      await linkAndStampTrusted(
        customerService,
        context.conversationId,
        created.customer.id,
        created.customer.name,
      );

      return {
        success: true,
        customerId: created.customer.id,
        customerName: created.customer.name,
        customerGreeting: buildNewCustomerGreetingAr(name),
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
      "Create or resolve a customer in the CRM for booking. Requires customer name and mobile phone. If the phone already exists, returns that customerId and preserves the existing CRM name. If the phone is new, creates a customer profile. On WhatsApp, phone must match the current sender.",
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
